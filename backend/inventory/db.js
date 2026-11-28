const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');

// On the PC: AWS_ENDPOINT in .env sends the SDK to Floci
const config = {};
if (process.env.AWS_ENDPOINT) {
  config.endpoint = process.env.AWS_ENDPOINT;
}
const client = new DynamoDBClient(config);

// The Document client lets us use normal JavaScript objects with DynamoDB
const ddb = DynamoDBDocumentClient.from(client);

module.exports = ddb;
