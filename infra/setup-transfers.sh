#!/usr/bin/env bash

export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1
ENDPOINT=http://localhost:4566

if ! aws --endpoint-url "$ENDPOINT" dynamodb list-tables > /dev/null 2>&1; then
  echo "ERROR: Floci is not answering on $ENDPOINT, so nothing was created."
  echo "Open Docker Desktop, then run:  docker compose -f infra/floci/docker-compose.yml up -d"
  exit 1
fi

awsl() {
  MSYS_NO_PATHCONV=1 aws --endpoint-url "$ENDPOINT" "$@"
}

echo "=== 1) DynamoDB table ==="
awsl dynamodb create-table --table-name TransferRequests \
  --attribute-definitions AttributeName=transferId,AttributeType=S \
  --key-schema AttributeName=transferId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST > /dev/null 2>&1 \
  && echo "  created table TransferRequests" || echo "  table TransferRequests already exists"

echo "=== 2) IAM role (least privilege) ==="
awsl iam create-role --role-name transfers-backend-role \
  --assume-role-policy-document file://infra/trust-policy.json > /dev/null 2>&1 \
  && echo "  created role transfers-backend-role" || echo "  role already exists"
awsl iam put-role-policy --role-name transfers-backend-role \
  --policy-name transfers-least-privilege \
  --policy-document file://infra/transfers-policy.json \
  && echo "  attached policy transfers-least-privilege"

echo "=== 3) S3 bucket for the transfers page ==="
awsl s3 mb s3://transfers-frontend > /dev/null 2>&1 \
  && echo "  created bucket transfers-frontend" || echo "  bucket already exists"
if [ -f frontend/transfers.html ]; then
  aws --endpoint-url "$ENDPOINT" s3 cp frontend/transfers.html s3://transfers-frontend/transfers.html --content-type text/html
  aws --endpoint-url "$ENDPOINT" s3 cp frontend/css/style.css s3://transfers-frontend/css/style.css --content-type text/css
  aws --endpoint-url "$ENDPOINT" s3 cp frontend/css/transfers.css s3://transfers-frontend/css/transfers.css --content-type text/css
  aws --endpoint-url "$ENDPOINT" s3 cp frontend/js/config.js s3://transfers-frontend/js/config.js --content-type application/javascript
  aws --endpoint-url "$ENDPOINT" s3 cp frontend/js/transfers-config.js s3://transfers-frontend/js/transfers-config.js --content-type application/javascript
  aws --endpoint-url "$ENDPOINT" s3 cp frontend/js/common.js s3://transfers-frontend/js/common.js --content-type application/javascript
  aws --endpoint-url "$ENDPOINT" s3 cp frontend/js/transfers.js s3://transfers-frontend/js/transfers.js --content-type application/javascript
  aws --endpoint-url "$ENDPOINT" s3 cp frontend/approvals.html s3://transfers-frontend/approvals.html --content-type text/html
  aws --endpoint-url "$ENDPOINT" s3 cp frontend/js/approvals.js s3://transfers-frontend/js/approvals.js --content-type application/javascript
  echo "  Transfers page on S3: $ENDPOINT/transfers-frontend/transfers.html"
  echo "  Approvals page on S3: $ENDPOINT/transfers-frontend/approvals.html"
fi

echo "=== Done ==="
