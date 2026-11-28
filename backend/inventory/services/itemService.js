const { ScanCommand, PutCommand, GetCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const ddb = require('../db');

const TABLE = 'InventoryItems';

// Returns all items, oldest first
async function readItems() {
  const result = await ddb.send(new ScanCommand({ TableName: TABLE }));
  return result.Items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

// Finds an item by its SKU (not case sensitive); returns it or undefined
async function findItemBySku(sku) {
  const items = await readItems();
  const wanted = sku.trim().toUpperCase();
  return items.find((item) => item.sku === wanted);
}

// Returns the items whose name, SKU or category contains the search text
async function searchItems(searchText) {
  const items = await readItems();
  const text = (searchText || '').trim().toLowerCase();
  if (text === '') {
    return items;
  }
  return items.filter((item) =>
    item.name.toLowerCase().includes(text) ||
    item.sku.toLowerCase().includes(text) ||
    item.category.toLowerCase().includes(text)
  );
}

// Saves a new item and returns it
async function createItem({ name, sku, category, description }) {
  const item = {
    itemId: `ITM-${Date.now()}`,
    name: name.trim(),
    sku: sku.trim().toUpperCase(),
    category: category.trim(),
    description: (description || '').trim(),
    createdAt: new Date().toISOString()
  };
  await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
  return item;
}

// Finds one item by its id (the table key); returns it or undefined
async function findItemById(itemId) {
  const result = await ddb.send(new GetCommand({ TableName: TABLE, Key: { itemId } }));
  return result.Item;
}

// Saves the new name, SKU, category and description of an item and returns it
async function updateItem(item, changes) {
  const updated = {
    ...item,
    name: changes.name !== undefined ? changes.name.trim() : item.name,
    sku: changes.sku !== undefined ? changes.sku.trim().toUpperCase() : item.sku,
    category: changes.category !== undefined ? changes.category.trim() : item.category,
    description: changes.description !== undefined ? changes.description.trim() : item.description,
    updatedAt: new Date().toISOString()
  };
  await ddb.send(new PutCommand({ TableName: TABLE, Item: updated }));
  return updated;
}

// Deletes one item by its id
async function deleteItem(itemId) {
  await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { itemId } }));
}

module.exports = {
  readItems, findItemBySku, searchItems, createItem, findItemById, updateItem, deleteItem
};