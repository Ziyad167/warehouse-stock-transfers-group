// Talks to the Inventory service (Ziyad's part) over HTTP.
// The user's own login token is passed on, so Inventory applies its own rules
// (for example: stock can never go below 0, only managers can add a new stock record).
const INVENTORY_API = process.env.INVENTORY_API;

// Sends one request to the Inventory service and returns { status, body }
async function callInventory(path, token, method = 'GET', data) {
  const options = { method, headers: { Authorization: `Bearer ${token}` } };
  if (data !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(data);
  }
  const response = await fetch(`${INVENTORY_API}${path}`, options);
  const body = await response.json();
  return { status: response.status, body };
}

// GET /api/auth/me -> who owns this token; returns { username, role } or null
async function getCurrentUser(token) {
  const { status, body } = await callInventory('/api/auth/me', token);
  return status === 200 ? body : null;
}

// GET /api/items/:id/stock -> { item, stock: [{ inventoryId, warehouseId, quantity, ... }] }
// Returns null if the item does not exist
async function findItemStock(token, itemId) {
  const { status, body } = await callInventory(
    `/api/items/${encodeURIComponent(itemId)}/stock`, token);
  return status === 200 ? body : null;
}

// GET /api/warehouses -> all warehouses (used to show names in messages)
async function listWarehouses(token) {
  const { status, body } = await callInventory('/api/warehouses', token);
  return status === 200 ? body : [];
}

// PATCH /api/inventory/:id with { change } -> adds or removes units.
// Returns { status, body } so the caller can see why Inventory said no.
async function changeStock(token, inventoryId, change) {
  return callInventory(`/api/inventory/${encodeURIComponent(inventoryId)}`, token, 'PATCH', { change });
}

// POST /api/inventory -> first stock record of an item in a warehouse.
// Returns { status, body }. Inventory allows this for managers only.
async function createStockRecord(token, warehouseId, itemId, quantity) {
  return callInventory('/api/inventory', token, 'POST', { warehouseId, itemId, quantity });
}

module.exports = { getCurrentUser, findItemStock, listWarehouses, changeStock, createStockRecord };
