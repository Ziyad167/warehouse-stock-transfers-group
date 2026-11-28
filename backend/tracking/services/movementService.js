const { PutCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const ddb = require('../db');

// One stock movement = one change of an item's stock in one warehouse, caused by a transfer.
// movementType is OUT (dispatched from the source) or IN (received at the destination).
const TABLE = 'StockMovements';

// Counter so two movements saved in the same millisecond still get different ids
let counter = 0;

// Saves a movement and returns it
async function recordMovement({ itemId, transferId, warehouseId, movementType, quantity, performedBy, note }) {
  counter = counter + 1;
  const movement = {
    movementId: `MOV-${Date.now()}-${counter}`,
    itemId,
    transferId,
    warehouseId,
    movementType,
    quantity,
    date: new Date().toISOString(),
    performedBy
  };
  if (note) {
    movement.note = note;
  }
  await ddb.send(new PutCommand({ TableName: TABLE, Item: movement }));
  return movement;
}

// Returns movements, newest first. Optional filters: itemId and warehouseId.
async function listMovements({ itemId, warehouseId }) {
  const conditions = [];
  const values = {};
  if (itemId) {
    conditions.push('itemId = :i');
    values[':i'] = itemId;
  }
  if (warehouseId) {
    conditions.push('warehouseId = :w');
    values[':w'] = warehouseId;
  }

  const params = { TableName: TABLE };
  if (conditions.length > 0) {
    params.FilterExpression = conditions.join(' AND ');
    params.ExpressionAttributeValues = values;
  }

  const result = await ddb.send(new ScanCommand(params));
  return result.Items.sort((a, b) => b.date.localeCompare(a.date));
}

module.exports = { recordMovement, listMovements };
