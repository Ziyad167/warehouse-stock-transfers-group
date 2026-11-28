const { ScanCommand, PutCommand, GetCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const ddb = require('../db');

const TABLE = 'InventoryStock';

async function listByWarehouse(warehouseId) {
  const result = await ddb.send(new ScanCommand({
    TableName: TABLE,
    FilterExpression: 'warehouseId = :w',
    ExpressionAttributeValues: { ':w': warehouseId }
  }));
  return result.Items;
}
async function listByItem(itemId) {
  const result = await ddb.send(new ScanCommand({
    TableName: TABLE,
    FilterExpression: 'itemId = :i',
    ExpressionAttributeValues: { ':i': itemId }
  }));
  return result.Items;
}

async function findRecord(warehouseId, itemId) {
  const records = await listByWarehouse(warehouseId);
  return records.find((record) => record.itemId === itemId);
}

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

async function findRecordById(inventoryId) {
  const result = await ddb.send(new GetCommand({ TableName: TABLE, Key: { inventoryId } }));
  return result.Item;
}

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