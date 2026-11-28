const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');

const config = {};
if (process.env.AWS_ENDPOINT) {
  config.endpoint = process.env.AWS_ENDPOINT;
}
const client = new DynamoDBClient(config);

const ddb = DynamoDBDocumentClient.from(client);

module.exports = ddb;
