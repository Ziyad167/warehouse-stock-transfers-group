// Transfers page configuration: where the Transfers API runs.
// INVENTORY_API (login, warehouses, items, stock) comes from js/config.js.
// Nothing in this file is secret: every visitor can read it.
// Page opened from S3 on Floci (port 4566) -> the API Gateway address, written by infra/deploy-transfers.sh
// Page opened with http-server (port 8080) -> the backend started with npm run dev
const TRANSFERS_CLOUD_API = 'http://localhost:4566/_aws/execute-api/40239bc039/$default';
const TRANSFERS_API = window.location.port === '4566' ? TRANSFERS_CLOUD_API : 'http://localhost:3002';
