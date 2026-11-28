const INVENTORY_API = process.env.INVENTORY_API;

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

async function getCurrentUser(token) {
  const { status, body } = await callInventory('/api/auth/me', token);
  return status === 200 ? body : null;
}

async function findItemStock(token, itemId) {
  const { status, body } = await callInventory(
    `/api/items/${encodeURIComponent(itemId)}/stock`, token);
  return status === 200 ? body : null;
}

async function listWarehouses(token) {
  const { status, body } = await callInventory('/api/warehouses', token);
  return status === 200 ? body : [];
}

async function changeStock(token, inventoryId, change) {
  return callInventory(`/api/inventory/${encodeURIComponent(inventoryId)}`, token, 'PATCH', { change });
}

async function createStockRecord(token, warehouseId, itemId, quantity) {
  return callInventory('/api/inventory', token, 'POST', { warehouseId, itemId, quantity });
}

module.exports = { getCurrentUser, findItemStock, listWarehouses, changeStock, createStockRecord };
