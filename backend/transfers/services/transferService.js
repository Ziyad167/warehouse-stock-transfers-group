const { ScanCommand, PutCommand, GetCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const ddb = require('../db');

const TABLE = 'TransferRequests';

async function createTransfer({ fromWarehouseId, toWarehouseId, itemId, quantity, note, requestedBy }) {
  const transfer = {
    transferId: `TRF-${Date.now()}`,
    fromWarehouseId,
    toWarehouseId,
    itemId,
    quantity,
    note: (note || '').trim(),
    status: 'PENDING',
    requestedBy,
    requestedAt: new Date().toISOString()
  };
  await ddb.send(new PutCommand({ TableName: TABLE, Item: transfer }));
  return transfer;
}

async function findTransferById(transferId) {
  const result = await ddb.send(new GetCommand({ TableName: TABLE, Key: { transferId } }));
  return result.Item;
}

async function listTransfers({ status, warehouseId }) {
  const conditions = [];
  const values = {};
  if (status) {
    conditions.push('#status = :status');
    values[':status'] = status;
  }
  if (warehouseId) {
    conditions.push('(fromWarehouseId = :w OR toWarehouseId = :w)');
    values[':w'] = warehouseId;
  }

  const params = { TableName: TABLE };
  if (conditions.length > 0) {
    params.FilterExpression = conditions.join(' AND ');
    params.ExpressionAttributeValues = values;
    if (status) {
      params.ExpressionAttributeNames = { '#status': 'status' };
    }
  }

  const result = await ddb.send(new ScanCommand(params));
  return result.Items.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
}

async function decideTransfer(transferId, { status, decidedBy, reason }) {
  try {
    const result = await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: { transferId },
      UpdateExpression: 'SET #status = :status, decidedBy = :by, decidedAt = :at, decisionReason = :reason',
      ConditionExpression: '#status = :pending',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': status,
        ':by': decidedBy,
        ':at': new Date().toISOString(),
        ':reason': (reason || '').trim(),
        ':pending': 'PENDING'
      },
      ReturnValues: 'ALL_NEW'
    }));
    return result.Attributes;
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') {
      return null;
    }
    throw error;
  }
}

async function deleteTransfer(transferId) {
  try {
    await ddb.send(new DeleteCommand({
      TableName: TABLE,
      Key: { transferId },
      ConditionExpression: '#status = :pending',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':pending': 'PENDING' }
    }));
    return true;
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') {
      return false;
    }
    throw error;
  }
}

module.exports = { createTransfer, findTransferById, listTransfers, decideTransfer, deleteTransfer };
