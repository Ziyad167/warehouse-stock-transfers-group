const { ScanCommand, PutCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const ddb = require('../db');

const TABLE = 'InventoryWarehouses';

async function readWarehouses() {
  const result = await ddb.send(new ScanCommand({ TableName: TABLE }));
  return result.Items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

async function findWarehouseByName(name) {
  const warehouses = await readWarehouses();
  const wanted = name.trim().toLowerCase();
  return warehouses.find((warehouse) => warehouse.name.toLowerCase() === wanted);
}

async function createWarehouse({ name, location }) {
  const warehouse = {
    warehouseId: `WH-${Date.now()}`,
    name: name.trim(),
    location: location.trim(),
    createdAt: new Date().toISOString()
  };
  await ddb.send(new PutCommand({ TableName: TABLE, Item: warehouse }));
  return warehouse;
}

async function findWarehouseById(warehouseId) {
  const result = await ddb.send(new GetCommand({ TableName: TABLE, Key: { warehouseId } }));
  return result.Item;
}

async function updateWarehouse(warehouse, changes) {
  const updated = {
    ...warehouse,
    name: changes.name !== undefined ? changes.name.trim() : warehouse.name,
    location: changes.location !== undefined ? changes.location.trim() : warehouse.location,
    updatedAt: new Date().toISOString()
  };
  await ddb.send(new PutCommand({ TableName: TABLE, Item: updated }));
  return updated;
}

module.exports = {
  readWarehouses, findWarehouseByName, createWarehouse, findWarehouseById, updateWarehouse
};
