const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');

// Lab 8: the AWS SDK talks to Floci (local AWS) instead of real AWS.
// All the settings come from the .env file.
const client = new DynamoDBClient({
  endpoint: process.env.AWS_ENDPOINT,
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// The Document client lets us use normal JavaScript objects with DynamoDB
const ddb = DynamoDBDocumentClient.from(client);

module.exports = ddb;
