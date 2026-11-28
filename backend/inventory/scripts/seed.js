require('dotenv').config({ quiet: true });
const { PutCommand } = require('@aws-sdk/lib-dynamodb');
const ddb = require('../db');
const warehouses = require('../data/warehouses.json');
const items = require('../data/items.json');
const inventory = require('../data/inventory.json');

async function putAll(tableName, rows) {
  for (const row of rows) {
    await ddb.send(new PutCommand({ TableName: tableName, Item: row }));
  }
  console.log(`${tableName}: ${rows.length} rows saved`);
}

async function main() {
  await putAll('InventoryWarehouses', warehouses);
  await putAll('InventoryItems', items);
  await putAll('InventoryStock', inventory);
}

main().catch((error) => {
  console.error('Seeding failed:', error.message);
  process.exit(1);
});