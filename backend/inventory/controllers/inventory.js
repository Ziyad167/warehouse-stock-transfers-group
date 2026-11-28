const inventoryService = require('../services/inventoryService');
const warehouseService = require('../services/warehouseService');
const itemService = require('../services/itemService');
const alertService = require('../services/alertService');

// Sends an error in the same shape everywhere: { error: { code, message } }
function sendError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

// Validates a new inventory record; returns an error message or null
function validateNewRecord(warehouseId, itemId, quantity) {
  if (typeof warehouseId !== 'string' || warehouseId.trim() === '') {
    return 'warehouseId is required.';
  }
  if (typeof itemId !== 'string' || itemId.trim() === '') {
    return 'itemId is required.';
  }
  if (!Number.isInteger(quantity) || quantity < 0) {
    return 'Quantity must be a whole number of 0 or more.';
  }
  return null;
}

// POST /api/inventory -> 201 with the new record, or 400 / 404 / 409 / 415
async function createInventoryRecord(req, res, next) {
  try {
    if (!req.is('application/json')) {
      return sendError(res, 415, 'UNSUPPORTED_MEDIA_TYPE',
        'Content-Type must be application/json.');
    }

    const { warehouseId, itemId, quantity } = req.body;

    const problem = validateNewRecord(warehouseId, itemId, quantity);
    if (problem) {
      return sendError(res, 400, 'VALIDATION_ERROR', problem);
    }

    // The warehouse and the item must both exist
    const warehouse = await warehouseService.findWarehouseById(warehouseId);
    if (!warehouse) {
      return sendError(res, 404, 'WAREHOUSE_NOT_FOUND', 'Warehouse not found.');
    }
    const item = await itemService.findItemById(itemId);
    if (!item) {
      return sendError(res, 404, 'ITEM_NOT_FOUND', 'Item not found.');
    }

    // Business rule: one record per item per warehouse
    const existing = await inventoryService.findRecord(warehouseId, itemId);
    if (existing) {
      return sendError(res, 409, 'DUPLICATE_RECORD',
        'This item already has a stock record in this warehouse.');
    }

    const record = await inventoryService.createRecord({ warehouseId, itemId, quantity });
    res.status(201).json(record);
  } catch (error) {
    next(error);
  }
}

// GET /api/warehouses/:id/inventory -> 200 with the stock of one warehouse, or 404
async function listWarehouseInventory(req, res, next) {
  try {
    const warehouseId = req.params.id;
    const warehouse = await warehouseService.findWarehouseById(warehouseId);
    if (!warehouse) {
      return sendError(res, 404, 'WAREHOUSE_NOT_FOUND', 'Warehouse not found.');
    }

    const records = await inventoryService.listByWarehouse(warehouseId);
    const items = await itemService.readItems();

    // Add the item's name and SKU to each record so the answer is easy to read
    const stock = records.map((record) => {
      const item = items.find((one) => one.itemId === record.itemId);
      return {
        inventoryId: record.inventoryId,
        itemId: record.itemId,
        itemName: item ? item.name : 'Unknown item',
        sku: item ? item.sku : '',
        quantity: record.quantity,
        updatedAt: record.updatedAt
      };
    });

    res.status(200).json({ warehouse, stock });
  } catch (error) {
    next(error);
  }
}
// Validates the availability question; returns an error message or null
function validateAvailabilityQuery(warehouseId, itemId, quantity) {
  if (typeof warehouseId !== 'string' || warehouseId.trim() === '') {
    return 'warehouseId is required.';
  }
  if (typeof itemId !== 'string' || itemId.trim() === '') {
    return 'itemId is required.';
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    return 'Quantity must be a whole number of 1 or more.';
  }
  return null;
}

// GET /api/inventory/availability?warehouseId=..&itemId=..&quantity=..
// -> 200 with { availableQuantity, isAvailable, ... }, or 400 / 404
async function checkAvailability(req, res, next) {
  try {
    const { warehouseId, itemId } = req.query;
    // Values in the URL are always text, so turn quantity into a number
    const quantity = Number(req.query.quantity);

    const problem = validateAvailabilityQuery(warehouseId, itemId, quantity);
    if (problem) {
      return sendError(res, 400, 'VALIDATION_ERROR', problem);
    }

    const warehouse = await warehouseService.findWarehouseById(warehouseId);
    if (!warehouse) {
      return sendError(res, 404, 'WAREHOUSE_NOT_FOUND', 'Warehouse not found.');
    }
    const item = await itemService.findItemById(itemId);
    if (!item) {
      return sendError(res, 404, 'ITEM_NOT_FOUND', 'Item not found.');
    }

    const result = await inventoryService.checkAvailability(warehouseId, itemId, quantity);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
// PATCH /api/inventory/:id with { "change": 10 } or { "change": -10 }
// -> 200 with the updated record, or 400 / 404 / 409 / 415
async function updateStock(req, res, next) {
  try {
    if (!req.is('application/json')) {
      return sendError(res, 415, 'UNSUPPORTED_MEDIA_TYPE',
        'Content-Type must be application/json.');
    }

    const { change } = req.body;
    if (!Number.isInteger(change) || change === 0) {
      return sendError(res, 400, 'VALIDATION_ERROR',
        'Change must be a whole number that is not 0.');
    }

    const record = await inventoryService.findRecordById(req.params.id);
    if (!record) {
      return sendError(res, 404, 'INVENTORY_NOT_FOUND', 'Inventory record not found.');
    }

    // Business rule: stock can never go below 0
    if (record.quantity + change < 0) {
      return sendError(res, 409, 'INSUFFICIENT_STOCK',
        `Only ${record.quantity} in stock, cannot remove ${-change}.`);
    }

     const updated = await inventoryService.changeQuantity(req.params.id, change);

    // Warn managers through SNS if the stock is now below the limit
    const lowStockAlert = await alertService.sendLowStockAlert(updated);
    res.status(200).json({ ...updated, lowStockAlert });
  } catch (error) {
    next(error);
  }
}
// GET /api/items/:id/stock -> 200 with the warehouses that hold this item, or 404
async function listItemStock(req, res, next) {
  try {
    const item = await itemService.findItemById(req.params.id);
    if (!item) {
      return sendError(res, 404, 'ITEM_NOT_FOUND', 'Item not found.');
    }

    const records = await inventoryService.listByItem(item.itemId);
    const stock = [];
    let totalQuantity = 0;
    for (const record of records) {
      const warehouse = await warehouseService.findWarehouseById(record.warehouseId);
      stock.push({
        inventoryId: record.inventoryId,
        warehouseId: record.warehouseId,
        warehouseName: warehouse ? warehouse.name : 'Unknown warehouse',
        location: warehouse ? warehouse.location : '',
        quantity: record.quantity
      });
      totalQuantity = totalQuantity + record.quantity;
    }

    res.status(200).json({ item, totalQuantity, stock });
  } catch (error) {
    next(error);
  }
}
// DELETE /api/inventory/:id -> 204 (the item leaves this warehouse), or 404 / 409
async function deleteRecord(req, res, next) {
  try {
    const record = await inventoryService.findRecordById(req.params.id);
    if (!record) {
      return sendError(res, 404, 'INVENTORY_NOT_FOUND', 'Inventory record not found.');
    }

    // Business rule: only an empty record can be removed, so no stock disappears by mistake
    if (record.quantity !== 0) {
      return sendError(res, 409, 'NOT_EMPTY',
        `There are still ${record.quantity} in stock. Remove them first.`);
    }

    await inventoryService.deleteRecord(record.inventoryId);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  deleteRecord,
  createInventoryRecord,
  listWarehouseInventory,
  checkAvailability,
  updateStock,
  listItemStock
};