const { ScanCommand, PutCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const ddb = require('../db');

const TABLE = 'InventoryWarehouses';

// Returns all warehouses, oldest first
async function readWarehouses() {
  const result = await ddb.send(new ScanCommand({ TableName: TABLE }));
  return result.Items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

// Finds a warehouse by its name (not case sensitive); returns it or undefined
async function findWarehouseByName(name) {
  const warehouses = await readWarehouses();
  const wanted = name.trim().toLowerCase();
  return warehouses.find((warehouse) => warehouse.name.toLowerCase() === wanted);
}

// Saves a new warehouse and returns it
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

// Finds one warehouse by its id (the table key); returns it or undefined
async function findWarehouseById(warehouseId) {
  const result = await ddb.send(new GetCommand({ TableName: TABLE, Key: { warehouseId } }));
  return result.Item;
}

module.exports = { readWarehouses, findWarehouseByName, createWarehouse, findWarehouseById };
