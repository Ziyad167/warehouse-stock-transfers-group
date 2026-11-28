// Lab 7: runs the SAME Express app on AWS Lambda
const serverless = require('serverless-http');
const app = require('./app');

module.exports.handler = serverless(app);
