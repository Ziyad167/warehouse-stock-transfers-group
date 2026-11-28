// Frontend configuration: where the Inventory API runs.
// Nothing in this file is secret: every visitor can read it,
// so never put passwords or keys here.
// Page opened from S3 on Floci (port 4566) -> the API Gateway address, written by infra/deploy-inventory.sh
// Page opened with http-server (port 8080) -> the backend started with npm run dev
const INVENTORY_CLOUD_API = 'http://localhost:4566/_aws/execute-api/5c6f7e04b4/$default';
const INVENTORY_API = window.location.port === '4566' ? INVENTORY_CLOUD_API : 'http://localhost:3001';

// Same limit as LOW_STOCK_LIMIT in the backend .env: below this, stock is "Low"
const LOW_STOCK_LIMIT = 10;
