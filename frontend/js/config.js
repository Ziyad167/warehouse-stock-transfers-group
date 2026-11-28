// Frontend configuration: where the Inventory API runs.
const INVENTORY_CLOUD_API = 'http://localhost:4566/_aws/execute-api/5c6f7e04b4/$default';
const INVENTORY_API = window.location.port === '4566' ? INVENTORY_CLOUD_API : 'http://localhost:3001';

// Same limit as LOW_STOCK_LIMIT in the backend .env: below this, stock is "Low"
const LOW_STOCK_LIMIT = 10;
