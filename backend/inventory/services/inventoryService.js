const { ScanCommand, PutCommand, GetCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const ddb = require('../db');

const TABLE = 'InventoryStock';

// Returns all the inventory records of one warehouse.
// The FilterExpression asks DynamoDB to return only that warehouse's records.
async function listByWarehouse(warehouseId) {
  const result = await ddb.send(new ScanCommand({
    TableName: TABLE,
    FilterExpression: 'warehouseId = :w',
    ExpressionAttributeValues: { ':w': warehouseId }
  }));
  return result.Items;
}
// Returns all the inventory records of one item, in every warehouse
async function listByItem(itemId) {
  const result = await ddb.send(new ScanCommand({
    TableName: TABLE,
    FilterExpression: 'itemId = :i',
    ExpressionAttributeValues: { ':i': itemId }
  }));
  return result.Items;
}

// Finds the record of one item in one warehouse; returns it or undefined
async function findRecord(warehouseId, itemId) {
  const records = await listByWarehouse(warehouseId);
  return records.find((record) => record.itemId === itemId);
}

// Saves a new record and returns it
async function createRecord({ warehouseId, itemId, quantity }) {
  const record = {
    inventoryId: `INV-${Date.now()}`,
    warehouseId,
    itemId,
    quantity,
    updatedAt: new Date().toISOString()
  };
  await ddb.send(new PutCommand({ TableName: TABLE, Item: record }));
  return record;
}

// Checks if one warehouse has enough of one item; returns the result
async function checkAvailability(warehouseId, itemId, requestedQuantity) {
  const record = await findRecord(warehouseId, itemId);
  const availableQuantity = record ? record.quantity : 0;
  return {
    warehouseId,
    itemId,
    requestedQuantity,
    availableQuantity,
    isAvailable: availableQuantity >= requestedQuantity
  };
}

// Finds one inventory record by its id (the table key); returns it or undefined
async function findRecordById(inventoryId) {
  const result = await ddb.send(new GetCommand({ TableName: TABLE, Key: { inventoryId } }));
  return result.Item;
}

// Adds the change to the quantity (use a minus number to take stock out)
// and returns the updated record
async function changeQuantity(inventoryId, change) {
  const result = await ddb.send(new UpdateCommand({
    TableName: TABLE,
    Key: { inventoryId },
    UpdateExpression: 'SET quantity = quantity + :change, updatedAt = :now',
    ExpressionAttributeValues: { ':change': change, ':now': new Date().toISOString() },
    ReturnValues: 'ALL_NEW'
  }));
  return result.Attributes;
}

// Deletes one stock record (an item leaves a warehouse for good)
async function deleteRecord(inventoryId) {
  await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { inventoryId } }));
}

module.exports = {
  deleteRecord,
  findRecord,
  listByWarehouse,
  listByItem,
  createRecord,
  checkAvailability,
  findRecordById,
  changeQuantity
};