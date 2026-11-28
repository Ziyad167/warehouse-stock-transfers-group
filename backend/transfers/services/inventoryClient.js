const INVENTORY_API = process.env.INVENTORY_API;

async function callInventory(path, token) {
  const response = await fetch(`${INVENTORY_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const body = await response.json();
  return { status: response.status, body };
}

async function getCurrentUser(token) {
  const { status, body } = await callInventory('/api/auth/me', token);
  return status === 200 ? body : null;
}

async function findWarehouse(token, warehouseId) {
  const { status, body } = await callInventory(
    `/api/warehouses/${encodeURIComponent(warehouseId)}/inventory`, token);
  return status === 200 ? body.warehouse : null;
}

async function findItem(token, itemId) {
  const { status, body } = await callInventory(
    `/api/items/${encodeURIComponent(itemId)}/stock`, token);
  return status === 200 ? body.item : null;
}

async function checkAvailability(token, warehouseId, itemId, quantity) {
  const query = `?warehouseId=${encodeURIComponent(warehouseId)}` +
    `&itemId=${encodeURIComponent(itemId)}&quantity=${quantity}`;
  const { status, body } = await callInventory(`/api/inventory/availability${query}`, token);
  if (status !== 200) {
    throw new Error(body?.error?.message || `Inventory answered ${status}`);
  }
  return body;
}

module.exports = { getCurrentUser, findWarehouse, findItem, checkAvailability };
