const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } = require('@aws-sdk/client-sqs');

const awsConfig = {};
if (process.env.AWS_ENDPOINT) {
  awsConfig.endpoint = process.env.AWS_ENDPOINT;
}

const sns = new SNSClient(awsConfig);

async function notify(subject, message) {
  try {
    await sns.send(new PublishCommand({
      TopicArn: process.env.TRACKING_TOPIC_ARN,
      Subject: subject,
      Message: message
    }));
    return true;
  } catch (error) {
    console.warn(`Tracking notification failed: ${error.message}`);
    return false;
  }
}

const sqs = new SQSClient({ ...awsConfig, useQueueUrlAsEndpoint: false });

function readSnsMessage(message) {
  try {
    const envelope = JSON.parse(message.Body);
    return {
      id: message.MessageId,
      subject: envelope.Subject || 'Message',
      text: envelope.Message,
      sentAt: envelope.Timestamp
    };
  } catch (error) {
    return { id: message.MessageId, subject: 'Message', text: message.Body, sentAt: new Date().toISOString() };
  }
}

async function readMessages() {
  const queueUrl = process.env.TRACKING_QUEUE_URL;
  const result = await sqs.send(new ReceiveMessageCommand({
    QueueUrl: queueUrl,
    MaxNumberOfMessages: 10,
    WaitTimeSeconds: 0
  }));
  const messages = [];
  for (const message of result.Messages || []) {
    messages.push(readSnsMessage(message));
    await sqs.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: message.ReceiptHandle }));
  }
  return messages.sort((a, b) => a.sentAt.localeCompare(b.sentAt));
}

module.exports = { notify, readMessages };
