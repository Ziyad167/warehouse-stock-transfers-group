const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } = require('@aws-sdk/client-sqs');

// Lab 8: Amazon SNS on Floci tells the warehouses when goods leave and arrive.
const awsConfig = {};
if (process.env.AWS_ENDPOINT) {
  awsConfig.endpoint = process.env.AWS_ENDPOINT;
}

const sns = new SNSClient(awsConfig);

// Publishes one message to the tracking topic. Returns true if it was sent.
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

// The SQS queue keeps the dispatch and receipt messages until someone reads them
const sqs = new SQSClient({ ...awsConfig, useQueueUrlAsEndpoint: false });

// SNS puts its text inside a JSON "envelope" with Subject, Message and Timestamp
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

// Reads the new messages from the SQS queue (at most 10 at a time).
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
