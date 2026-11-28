const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } = require('@aws-sdk/client-sqs');
const itemService = require('./itemService');
const warehouseService = require('./warehouseService');

const awsConfig = {};
if (process.env.AWS_ENDPOINT) {
  awsConfig.endpoint = process.env.AWS_ENDPOINT;
}

const sns = new SNSClient(awsConfig);

const LOW_STOCK_LIMIT = Number(process.env.LOW_STOCK_LIMIT) || 10;

async function sendLowStockAlert(record) {
  if (record.quantity >= LOW_STOCK_LIMIT) {
    return false;
  }

  const item = await itemService.findItemById(record.itemId);
  const warehouse = await warehouseService.findWarehouseById(record.warehouseId);
  const message = `Low stock: ${item.name} (${item.sku}) in ${warehouse.name} ` +
    `has only ${record.quantity} left. The limit is ${LOW_STOCK_LIMIT}.`;

  try {
    await sns.send(new PublishCommand({
      TopicArn: process.env.LOW_STOCK_TOPIC_ARN,
      Subject: 'Low stock alert',
      Message: message
    }));
    return true;
  } catch (error) {
    console.warn(`Low stock alert failed: ${error.message}`);
    return false;
  }
}

const sqs = new SQSClient({ ...awsConfig, useQueueUrlAsEndpoint: false });

function readSnsMessage(message) {
  try {
    const envelope = JSON.parse(message.Body);
    return {
      id: message.MessageId,
      subject: envelope.Subject || 'Alert',
      text: envelope.Message,
      sentAt: envelope.Timestamp
    };
  } catch (error) {
    return { id: message.MessageId, subject: 'Alert', text: message.Body, sentAt: new Date().toISOString() };
  }
}

async function readAlerts() {
  const queueUrl = process.env.LOW_STOCK_QUEUE_URL;
  const result = await sqs.send(new ReceiveMessageCommand({
    QueueUrl: queueUrl,
    MaxNumberOfMessages: 10,
    WaitTimeSeconds: 0
  }));
  const alerts = [];
  for (const message of result.Messages || []) {
    alerts.push(readSnsMessage(message));
    await sqs.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: message.ReceiptHandle }));
  }
  return alerts.sort((a, b) => a.sentAt.localeCompare(b.sentAt));
}

module.exports = { sendLowStockAlert, readAlerts };