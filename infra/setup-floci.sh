#!/usr/bin/env bash
# Creates the Inventory service resources on Floci (local AWS), like Lab 8:
#   1) DynamoDB: 5 tables
#   2) IAM: a role with a least-privilege policy
#   3) S3: a bucket that serves the frontend
#   4) SNS + SQS: low-stock alerts (SNS sends them, the SQS queue keeps them)
# Run from the project root, in Git Bash:   bash infra/setup-floci.sh
# Safe to run again: anything that already exists is skipped.

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

# Creates one DynamoDB table whose key is one text attribute
create_table() {
  awsl dynamodb create-table --table-name "$1" \
    --attribute-definitions AttributeName="$2",AttributeType=S \
    --key-schema AttributeName="$2",KeyType=HASH \
    --billing-mode PAY_PER_REQUEST > /dev/null 2>&1 \
    && echo "  created table $1" || echo "  table $1 already exists"
}

echo "=== 1) DynamoDB tables ==="
create_table InventoryWarehouses warehouseId
create_table InventoryItems itemId
create_table InventoryStock inventoryId
create_table InventoryUsers username
create_table InventorySessions token

echo "=== 2) IAM role (least privilege) ==="
awsl iam create-role --role-name inventory-backend-role \
  --assume-role-policy-document file://infra/trust-policy.json > /dev/null 2>&1 \
  && echo "  created role inventory-backend-role" || echo "  role already exists"
awsl iam put-role-policy --role-name inventory-backend-role \
  --policy-name inventory-least-privilege \
  --policy-document file://infra/inventory-policy.json \
  && echo "  attached policy inventory-least-privilege"

echo "=== 3) S3 bucket for the frontend ==="
awsl s3 mb s3://inventory-frontend > /dev/null 2>&1 \
  && echo "  created bucket inventory-frontend" || echo "  bucket already exists"
aws --endpoint-url "$ENDPOINT" s3 cp frontend/inventory.html s3://inventory-frontend/inventory.html --content-type text/html
aws --endpoint-url "$ENDPOINT" s3 cp frontend/css/style.css s3://inventory-frontend/css/style.css --content-type text/css
aws --endpoint-url "$ENDPOINT" s3 cp frontend/js/config.js s3://inventory-frontend/js/config.js --content-type application/javascript
aws --endpoint-url "$ENDPOINT" s3 cp frontend/js/transfers-config.js s3://inventory-frontend/js/transfers-config.js --content-type application/javascript
aws --endpoint-url "$ENDPOINT" s3 cp frontend/js/common.js s3://inventory-frontend/js/common.js --content-type application/javascript
aws --endpoint-url "$ENDPOINT" s3 cp frontend/js/app.js s3://inventory-frontend/js/app.js --content-type application/javascript

echo "=== 4) SNS topic for low-stock alerts (+ SQS queue that keeps them) ==="
awsl sns create-topic --name inventory-low-stock-topic > /dev/null \
  && echo "  topic inventory-low-stock-topic ready"
awsl sqs create-queue --queue-name inventory-low-stock-alerts > /dev/null \
  && echo "  queue inventory-low-stock-alerts ready"
awsl sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:000000000000:inventory-low-stock-topic \
  --protocol sqs \
  --notification-endpoint arn:aws:sqs:us-east-1:000000000000:inventory-low-stock-alerts > /dev/null \
  && echo "  queue subscribed to the topic"
echo "=== Done ==="
echo "Frontend on S3: $ENDPOINT/inventory-frontend/inventory.html"