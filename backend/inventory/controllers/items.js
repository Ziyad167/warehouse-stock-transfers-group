const itemService = require('../services/itemService');
const inventoryService = require('../services/inventoryService');

const SKU_PATTERN = /^[A-Za-z0-9-]{3,30}$/;

function sendError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

function checkText(value, label, min, max) {
  if (typeof value !== 'string') {
    return `${label} is required.`;
  }
  const length = value.trim().length;
  if (length < min || length > max) {
    return `${label} must contain between ${min} and ${max} characters.`;
  }
  return null;
}
function validateNewItem(name, sku, category, description) {
  const textProblem = checkText(name, 'Name', 2, 100) ||
    checkText(category, 'Category', 2, 50);
  if (textProblem) return textProblem;

  if (typeof sku !== 'string' || !SKU_PATTERN.test(sku.trim())) {
    return 'SKU is required and must be 3 to 30 letters, numbers or dashes.';
  }
  if (description !== undefined &&
      (typeof description !== 'string' || description.length > 500)) {
    return 'Description must be text of at most 500 characters.';
  }
  return null;
}
async function listItems(req, res, next) {
  try {
    const items = await itemService.searchItems(req.query.search);
    res.status(200).json(items);
  } catch (error) {
    next(error);
  }
}
async function createItem(req, res, next) {
  try {
    if (!req.is('application/json')) {
      return sendError(res, 415, 'UNSUPPORTED_MEDIA_TYPE',
        'Content-Type must be application/json.');
    }

    const { name, sku, category, description } = req.body;

    const problem = validateNewItem(name, sku, category, description);
    if (problem) {
      return sendError(res, 400, 'VALIDATION_ERROR', problem);
    }

    const existing = await itemService.findItemBySku(sku);
    if (existing) {
      return sendError(res, 409, 'DUPLICATE_SKU',
        `An item with SKU ${existing.sku} already exists.`);
    }

    const item = await itemService.createItem({ name, sku, category, description });
    res.status(201).json(item);
  } catch (error) {
    next(error);
  }
}
// Validates the changes to an item: only the fields that are sent are checked
function validateItemChanges({ name, sku, category, description }) {
  if (name === undefined && sku === undefined && category === undefined && description === undefined) {
    return 'Send at least one of: name, sku, category, description.';
  }
  if (name !== undefined) {
    const problem = checkText(name, 'Name', 2, 100);
    if (problem) return problem;
  }
  if (category !== undefined) {
    const problem = checkText(category, 'Category', 2, 50);
    if (problem) return problem;
  }
  if (sku !== undefined && (typeof sku !== 'string' || !SKU_PATTERN.test(sku.trim()))) {
    return 'SKU must be 3 to 30 letters, numbers or dashes.';
  }
  if (description !== undefined &&
      (typeof description !== 'string' || description.length > 500)) {
    return 'Description must be text of at most 500 characters.';
  }
  return null;
}

// PATCH /api/items/:id -> 200 with the changed item, or 400 / 404 / 409 / 415
async function updateItem(req, res, next) {
  try {
    if (!req.is('application/json')) {
      return sendError(res, 415, 'UNSUPPORTED_MEDIA_TYPE',
        'Content-Type must be application/json.');
    }

    const item = await itemService.findItemById(req.params.id);
    if (!item) {
      return sendError(res, 404, 'ITEM_NOT_FOUND', 'Item not found.');
    }

    const { name, sku, category, description } = req.body;
    const problem = validateItemChanges({ name, sku, category, description });
    if (problem) {
      return sendError(res, 400, 'VALIDATION_ERROR', problem);
    }

    // Business rule: a new SKU must not belong to another item
    if (sku !== undefined) {
      const owner = await itemService.findItemBySku(sku);
      if (owner && owner.itemId !== item.itemId) {
        return sendError(res, 409, 'DUPLICATE_SKU',
          `An item with SKU ${owner.sku} already exists.`);
      }
    }

    const updated = await itemService.updateItem(item, { name, sku, category, description });
    res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
}

// DELETE /api/items/:id -> 204, or 404 / 409
async function deleteItem(req, res, next) {
  try {
    const item = await itemService.findItemById(req.params.id);
    if (!item) {
      return sendError(res, 404, 'ITEM_NOT_FOUND', 'Item not found.');
    }

    // Business rule: an item that a warehouse still holds cannot be deleted
    const records = await inventoryService.listByItem(item.itemId);
    if (records.length > 0) {
      const word = records.length === 1 ? 'warehouse' : 'warehouses';
      return sendError(res, 409, 'ITEM_IN_USE',
        `${item.name} is still in ${records.length} ${word}. Remove it from every warehouse first.`);
    }

    await itemService.deleteItem(item.itemId);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listItems,
  createItem,
  updateItem,
  deleteItem
};