// Tracking page configuration: where the Tracking API runs.
// INVENTORY_API comes from js/config.js and TRANSFERS_API from js/transfers-config.js.
// Nothing in this file is secret: every visitor can read it.
// Page opened from S3 on Floci (port 4566) -> the API Gateway address, written by infra/deploy-tracking.sh
// Page opened with http-server (port 8080) -> the backend started with npm run dev
const TRACKING_CLOUD_API = 'http://localhost:4566/_aws/execute-api/55f7de1800/$default';
const TRACKING_API = window.location.port === '4566' ? TRACKING_CLOUD_API : 'http://localhost:3003';
