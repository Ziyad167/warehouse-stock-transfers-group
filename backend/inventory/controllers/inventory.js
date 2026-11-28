const inventoryService = require('../services/inventoryService');
const warehouseService = require('../services/warehouseService');
const itemService = require('../services/itemService');
const alertService = require('../services/alertService');

function sendError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

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

    const warehouse = await warehouseService.findWarehouseById(warehouseId);
    if (!warehouse) {
      return sendError(res, 404, 'WAREHOUSE_NOT_FOUND', 'Warehouse not found.');
    }
    const item = await itemService.findItemById(itemId);
    if (!item) {
      return sendError(res, 404, 'ITEM_NOT_FOUND', 'Item not found.');
    }

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

async function listWarehouseInventory(req, res, next) {
  try {
    const warehouseId = req.params.id;
    const warehouse = await warehouseService.findWarehouseById(warehouseId);
    if (!warehouse) {
      return sendError(res, 404, 'WAREHOUSE_NOT_FOUND', 'Warehouse not found.');
    }

    const records = await inventoryService.listByWarehouse(warehouseId);
    const items = await itemService.readItems();

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

async function checkAvailability(req, res, next) {
  try {
    const { warehouseId, itemId } = req.query;
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

    if (record.quantity + change < 0) {
      return sendError(res, 409, 'INSUFFICIENT_STOCK',
        `Only ${record.quantity} in stock, cannot remove ${-change}.`);
    }

     const updated = await inventoryService.changeQuantity(req.params.id, change);

    const lowStockAlert = await alertService.sendLowStockAlert(updated);
    res.status(200).json({ ...updated, lowStockAlert });
  } catch (error) {
    next(error);
  }
}
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
async function deleteRecord(req, res, next) {
  try {
    const record = await inventoryService.findRecordById(req.params.id);
    if (!record) {
      return sendError(res, 404, 'INVENTORY_NOT_FOUND', 'Inventory record not found.');
    }

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