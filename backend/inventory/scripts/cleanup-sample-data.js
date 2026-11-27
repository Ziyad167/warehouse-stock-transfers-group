// One-off clean-up of the test data on Floci (run inside backend/inventory):
//   node scripts/cleanup-sample-data.js
//
// 1) Duplicate warehouses: when two warehouses have the same name, the oldest one is
//    kept. A newer copy is deleted ONLY if no stock record and no transfer request
//    uses it; otherwise it is kept and reported, so no data is lost.
// 2) Item names: items get the names written in data/items.json (ids and SKUs stay).
require('dotenv').config({ quiet: true });
const { ScanCommand, DeleteCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const ddb = require('../db');
const sampleItems = require('../data/items.json');

async function scanAll(tableName) {
  try {
    const result = await ddb.send(new ScanCommand({ TableName: tableName }));
    return result.Items;
  } catch (error) {
    // The TransferRequests table exists only after Mostafa's setup script
    if (error.name === 'ResourceNotFoundException') {
      return [];
    }
    throw error;
  }
}

async function removeDuplicateWarehouses() {
  const warehouses = await scanAll('InventoryWarehouses');
  const stock = await scanAll('InventoryStock');
  const transfers = await scanAll('TransferRequests');

  warehouses.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const keptByName = {};

  for (const warehouse of warehouses) {
    const key = warehouse.name.trim().toLowerCase();
    if (!keptByName[key]) {
      keptByName[key] = warehouse;
      continue;
    }

    const id = warehouse.warehouseId;
    const usedByStock = stock.some((record) => record.warehouseId === id);
    const usedByTransfers = transfers.some((transfer) =>
      transfer.fromWarehouseId === id || transfer.toWarehouseId === id);

    if (usedByStock || usedByTransfers) {
      console.log(`Kept duplicate ${id} "${warehouse.name}": it still has stock or transfers.`);
    } else {
      await ddb.send(new DeleteCommand({ TableName: 'InventoryWarehouses', Key: { warehouseId: id } }));
      console.log(`Deleted duplicate ${id} "${warehouse.name}" (kept ${keptByName[key].warehouseId}).`);
    }
  }
}

async function renameItems() {
  const items = await scanAll('InventoryItems');
  for (const sample of sampleItems) {
    const item = items.find((one) => one.itemId === sample.itemId);
    if (item && item.name !== sample.name) {
      await ddb.send(new UpdateCommand({
        TableName: 'InventoryItems',
        Key: { itemId: item.itemId },
        UpdateExpression: 'SET #name = :name',
        ExpressionAttributeNames: { '#name': 'name' },
        ExpressionAttributeValues: { ':name': sample.name }
      }));
      console.log(`Renamed ${item.itemId}: "${item.name}" -> "${sample.name}"`);
    }
  }
}

async function main() {
  await removeDuplicateWarehouses();
  await renameItems();
  console.log('Clean-up finished.');
}

main().catch((error) => {
  console.error('Clean-up failed:', error.message);
  process.exit(1);
});
