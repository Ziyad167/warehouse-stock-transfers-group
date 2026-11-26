const app = require('./app');

const PORT = Number(process.env.PORT) || 3002;

app.listen(PORT, () => {
  const env = process.env.NODE_ENV || 'development';
  console.log(`Transfers API listening on http://localhost:${PORT} (${env})`);
});
