const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');

// On the PC: AWS_ENDPOINT in .env sends the SDK to Floci; the keys and the region
// are also in .env, and the SDK reads them by itself.
// On Lambda: AWS_ENDPOINT is not set. Lambda gives the region and the role's keys,
// and Floci gives the endpoint, so the SDK uses its defaults (as in Lab 7).
const config = {};
if (process.env.AWS_ENDPOINT) {
  config.endpoint = process.env.AWS_ENDPOINT;
}
const client = new DynamoDBClient(config);

// The Document client lets us use normal JavaScript objects with DynamoDB
const ddb = DynamoDBDocumentClient.from(client);

module.exports = ddb;
