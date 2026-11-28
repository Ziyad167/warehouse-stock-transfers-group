// Tracking page configuration: where the Tracking API runs.
const TRACKING_CLOUD_API = 'http://localhost:4566/_aws/execute-api/55f7de1800/$default';
const TRACKING_API = window.location.port === '4566' ? TRACKING_CLOUD_API : 'http://localhost:3003';
