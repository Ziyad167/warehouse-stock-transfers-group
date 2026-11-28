#!/usr/bin/env bash
# Creates the Transfer Tracking service resources on Floci (local AWS)

# Floci accepts these dummy test credentials (they are not real secrets)
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1
ENDPOINT=http://localhost:4566

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

echo "=== 1) DynamoDB table ==="
awsl dynamodb create-table --table-name StockMovements \
  --attribute-definitions AttributeName=movementId,AttributeType=S \
  --key-schema AttributeName=movementId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST > /dev/null 2>&1 \
  && echo "  created table StockMovements" || echo "  table StockMovements already exists"

echo "=== 2) IAM role (least privilege) ==="
awsl iam create-role --role-name tracking-backend-role \
  --assume-role-policy-document file://infra/trust-policy.json > /dev/null 2>&1 \
  && echo "  created role tracking-backend-role" || echo "  role already exists"
awsl iam put-role-policy --role-name tracking-backend-role \
  --policy-name tracking-least-privilege \
  --policy-document file://infra/tracking-policy.json \
  && echo "  attached policy tracking-least-privilege"

echo "=== 3) S3 bucket for the tracking page ==="
awsl s3 mb s3://tracking-frontend > /dev/null 2>&1 \
  && echo "  created bucket tracking-frontend" || echo "  bucket already exists"
aws --endpoint-url "$ENDPOINT" s3 cp frontend/tracking.html s3://tracking-frontend/tracking.html --content-type text/html
aws --endpoint-url "$ENDPOINT" s3 cp frontend/css/style.css s3://tracking-frontend/css/style.css --content-type text/css
aws --endpoint-url "$ENDPOINT" s3 cp frontend/css/tracking.css s3://tracking-frontend/css/tracking.css --content-type text/css
aws --endpoint-url "$ENDPOINT" s3 cp frontend/js/config.js s3://tracking-frontend/js/config.js --content-type application/javascript
aws --endpoint-url "$ENDPOINT" s3 cp frontend/js/transfers-config.js s3://tracking-frontend/js/transfers-config.js --content-type application/javascript
aws --endpoint-url "$ENDPOINT" s3 cp frontend/js/tracking-config.js s3://tracking-frontend/js/tracking-config.js --content-type application/javascript
aws --endpoint-url "$ENDPOINT" s3 cp frontend/js/common.js s3://tracking-frontend/js/common.js --content-type application/javascript
aws --endpoint-url "$ENDPOINT" s3 cp frontend/js/tracking.js s3://tracking-frontend/js/tracking.js --content-type application/javascript

echo "=== 4) SNS topic for dispatch and receipt messages (+ SQS queue that keeps them) ==="
awsl sns create-topic --name transfer-tracking-topic > /dev/null \
  && echo "  topic transfer-tracking-topic ready"
awsl sqs create-queue --queue-name transfer-tracking-events > /dev/null \
  && echo "  queue transfer-tracking-events ready"
awsl sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:000000000000:transfer-tracking-topic \
  --protocol sqs \
  --notification-endpoint arn:aws:sqs:us-east-1:000000000000:transfer-tracking-events > /dev/null \
  && echo "  queue subscribed to the topic"
echo "=== Done ==="
echo "Tracking page on S3: $ENDPOINT/tracking-frontend/tracking.html"
