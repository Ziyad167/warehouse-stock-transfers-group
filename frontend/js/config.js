// Frontend configuration: where the Inventory API runs.
// Nothing in this file is secret: every visitor can read it,
// so never put passwords or keys here.
const INVENTORY_API = 'http://localhost:3001';

// Same limit as LOW_STOCK_LIMIT in the backend .env: below this, stock is "Low"
const LOW_STOCK_LIMIT = 10;