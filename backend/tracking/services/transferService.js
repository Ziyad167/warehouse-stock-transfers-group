const { GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const ddb = require('../db');

const TABLE = 'TransferRequests';

async function findTransferById(transferId) {
  const result = await ddb.send(new GetCommand({ TableName: TABLE, Key: { transferId } }));
  return result.Item;
}

async function moveStatus(transferId, fromStatus, toStatus, fields) {
  const names = { '#status': 'status' };
  const values = { ':from': fromStatus, ':to': toStatus };
  const sets = ['#status = :to'];
  Object.keys(fields).forEach((key) => {
    sets.push(`${key} = :${key}`);
    values[`:${key}`] = fields[key];
  });

  try {
    const result = await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: { transferId },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ConditionExpression: '#status = :from',
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
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

async function undoStatus(transferId, currentStatus, oldStatus, fieldNames) {
  await ddb.send(new UpdateCommand({
    TableName: TABLE,
    Key: { transferId },
    UpdateExpression: `SET #status = :old REMOVE ${fieldNames.join(', ')}`,
    ConditionExpression: '#status = :current',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: { ':old': oldStatus, ':current': currentStatus }
  }));
}

module.exports = { findTransferById, moveStatus, undoStatus };
