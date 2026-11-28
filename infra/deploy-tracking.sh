#!/usr/bin/env bash
# Deploys the Tracking backend on Floci as a Lambda function behind API Gateway (Labs 6 and 7):
#   1) builds backend/tracking/lambda.zip (no .env inside)
#   2) lets the IAM role be used by Lambda
#   3) creates the Lambda function tracking-api (or updates its code)
#   4) creates the HTTP API tracking-http-api with one route per endpoint
#   5) writes the API address into frontend/js/tracking-config.js and uploads it to the S3 bucket
# Run from the project root in Git Bash, after the three setup-*.sh scripts:
#   bash infra/deploy-tracking.sh   (after deploy-inventory.sh)
# Safe to run again after a code change: it updates the code and keeps the same address.
set -e

# Floci accepts these dummy test credentials (they are not real secrets)
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1
export AWS_PAGER=""
ENDPOINT=http://localhost:4566
ACCOUNT=000000000000

# Stop here if Floci is not running (otherwise every command below fails)
if ! aws --endpoint-url "$ENDPOINT" dynamodb list-tables > /dev/null 2>&1; then
  echo "ERROR: Floci is not answering on $ENDPOINT, so nothing was created."
  echo "Open Docker Desktop, then run:  docker compose -f infra/floci/docker-compose.yml up -d"
  exit 1
fi

# Runs an AWS CLI command against Floci
awsl() {
  MSYS_NO_PATHCONV=1 aws --endpoint-url "$ENDPOINT" "$@"
}

FUNCTION=tracking-api
API_NAME=tracking-http-api
ROLE=tracking-backend-role
FOLDER=backend/tracking

# Tracking calls the Inventory API. Inside Floci a Lambda runs in Docker, where "localhost" is
# the function itself, so it calls Floci by its Docker name (floci) and picks the API by its id:
#   http://floci:4566/_aws/execute-api/<inventory api id>/$default
# (the browser uses http://<id>.execute-api.localhost.floci.io:4566 instead).
INVENTORY_ID=$(awsl apigatewayv2 get-apis --query "Items[?Name=='inventory-http-api'].ApiId | [0]" --output text)
if [ -z "$INVENTORY_ID" ] || [ "$INVENTORY_ID" = "None" ]; then
  echo "Deploy the Inventory API first: bash infra/deploy-inventory.sh"
  exit 1
fi
INVENTORY_INTERNAL="http://floci:4566/_aws/execute-api/$INVENTORY_ID/\$default"

# Settings the function reads from process.env (no AWS keys: on Lambda the role gives them)
ENV_JSON='{"Variables":{
  "NODE_ENV":"production",
  "INVENTORY_API":"'$INVENTORY_INTERNAL'",
  "TRACKING_TOPIC_ARN":"arn:aws:sns:us-east-1:000000000000:transfer-tracking-topic",
  "TRACKING_QUEUE_URL":"http://localhost:4566/000000000000/transfer-tracking-events"}}'

# Every endpoint of the Tracking service. API Gateway answers 404 to anything else.
ROUTES=(
  "GET /api/health"
  "PATCH /api/transfers/{id}/dispatch" "PATCH /api/transfers/{id}/receive"
  "GET /api/items/{id}/movements" "GET /api/movements"
  "GET /api/messages"
)

echo "=== 1) Build $FOLDER/lambda.zip ==="
(cd $FOLDER && npm install --no-audit --no-fund > /dev/null && npm run zip)

echo "=== 2) Let Lambda use the role $ROLE ==="
awsl iam update-assume-role-policy --role-name $ROLE \
  --policy-document file://infra/trust-policy.json
echo "  role $ROLE trusts lambda.amazonaws.com"

echo "=== 3) Lambda function $FUNCTION ==="
if awsl lambda get-function --function-name $FUNCTION > /dev/null 2>&1; then
  awsl lambda update-function-code --function-name $FUNCTION \
    --zip-file fileb://$FOLDER/lambda.zip > /dev/null
  awsl lambda wait function-updated-v2 --function-name $FUNCTION
  awsl lambda update-function-configuration --function-name $FUNCTION \
    --timeout 30 --environment "$ENV_JSON" > /dev/null
  echo "  updated $FUNCTION"
else
  awsl lambda create-function --function-name $FUNCTION \
    --runtime nodejs24.x --handler lambda.handler \
    --role arn:aws:iam::$ACCOUNT:role/$ROLE \
    --zip-file fileb://$FOLDER/lambda.zip --timeout 30 \
    --environment "$ENV_JSON" > /dev/null
  echo "  created $FUNCTION"
fi
awsl lambda wait function-active-v2 --function-name $FUNCTION

echo "=== 4) API Gateway: HTTP API $API_NAME ==="
API_ID=$(awsl apigatewayv2 get-apis --query "Items[?Name=='$API_NAME'].ApiId | [0]" --output text)
if [ -z "$API_ID" ] || [ "$API_ID" = "None" ]; then
  API_ID=$(awsl apigatewayv2 create-api --name $API_NAME --protocol-type HTTP --query ApiId --output text)
  INTEGRATION_ID=$(awsl apigatewayv2 create-integration --api-id $API_ID \
    --integration-type AWS_PROXY --payload-format-version 2.0 \
    --integration-uri arn:aws:lambda:us-east-1:$ACCOUNT:function:$FUNCTION \
    --query IntegrationId --output text)

  # The browser asks OPTIONS first (CORS) because every request has an Authorization header,
  # so each path also gets an OPTIONS route
  PATHS=$(printf '%s\n' "${ROUTES[@]}" | awk '{print $2}' | sort -u)
  for P in $PATHS; do ROUTES+=("OPTIONS $P"); done
  for ROUTE in "${ROUTES[@]}"; do
    awsl apigatewayv2 create-route --api-id $API_ID --route-key "$ROUTE" \
      --target integrations/$INTEGRATION_ID > /dev/null
    echo "  route $ROUTE"
  done

  awsl apigatewayv2 create-stage --api-id $API_ID --stage-name '$default' --auto-deploy > /dev/null
  awsl lambda add-permission --function-name $FUNCTION --statement-id apigw-invoke \
    --action lambda:InvokeFunction --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:us-east-1:$ACCOUNT:$API_ID/*" > /dev/null
  echo "  created API $API_ID"
else
  echo "  API $API_NAME already exists: $API_ID"
fi
# The pages call the API on the same address as the S3 pages (localhost:4566), so no DNS name
# and no CORS preflight across sites are needed:
API_URL="http://localhost:4566/_aws/execute-api/$API_ID/\$default"
# The same API by its API Gateway name (needs the DNS name localhost.floci.io to work)
GATEWAY_URL=http://$API_ID.execute-api.localhost.floci.io:4566

echo "=== 5) Point the pages at the API ==="
sed -i "s|^const TRACKING_CLOUD_API = .*|const TRACKING_CLOUD_API = '$API_URL';|" frontend/js/tracking-config.js
awsl s3 cp frontend/js/tracking-config.js s3://tracking-frontend/js/tracking-config.js --content-type application/javascript > /dev/null
echo "  frontend/js/tracking-config.js now uses $API_URL"

echo "=== Done ==="
echo "Tracking API: $API_URL/api/health"
echo "Same API by its API Gateway name: $GATEWAY_URL/api/health"
echo "It calls Inventory at: $INVENTORY_INTERNAL"
