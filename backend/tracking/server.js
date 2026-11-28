const app = require('./app');

const PORT = Number(process.env.PORT) || 3003;

app.listen(PORT, () => {
  const env = process.env.NODE_ENV || 'development';
  console.log(`Tracking API listening on http://localhost:${PORT} (${env})`);
});
