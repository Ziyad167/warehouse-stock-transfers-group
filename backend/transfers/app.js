require('dotenv').config({ quiet: true });
const express = require('express');
const cors = require('cors');
const transferRoutes = require('./routes/transfers');

const app = express();

// Logs every request: time, method and address
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl}`);
  next();
});

// 8080 = frontend on http-server, 4566 = frontend served from S3 on Floci
app.use(cors({
  origin: ['http://localhost:8080', 'http://localhost:4566']
}));
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', environment: process.env.NODE_ENV || 'development' });
});

app.use('/api/transfers', transferRoutes);

app.use((req, res) => {
  res.status(404).json({
    error: { code: 'ROUTE_NOT_FOUND', message: 'Route not found.' }
  });
});

app.use((error, req, res, next) => {
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Request body is not valid JSON.' }
    });
  }
  console.error(error);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected server error occurred.' }
  });
});

module.exports = app;
