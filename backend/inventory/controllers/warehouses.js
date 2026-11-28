const warehouseService = require('../services/warehouseService');

// Sends an error in the same shape everywhere: { error: { code, message } }
function sendError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

// Checks one text field: it must be text, with a length between min and max
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

// Validates the fields of a new warehouse; returns an error message or null
function validateNewWarehouse(name, location) {
  return checkText(name, 'Name', 2, 100) ||
    checkText(location, 'Location', 2, 100);
}

// GET /api/warehouses -> 200 with the list of all warehouses
async function listWarehouses(req, res, next) {
  try {
    const warehouses = await warehouseService.readWarehouses();
    res.status(200).json(warehouses);
  } catch (error) {
    next(error);
  }
}

// POST /api/warehouses -> 201 with the new warehouse, or 400 / 409 / 415
async function createWarehouse(req, res, next) {
  try {
    if (!req.is('application/json')) {
      return sendError(res, 415, 'UNSUPPORTED_MEDIA_TYPE',
        'Content-Type must be application/json.');
    }

    const { name, location } = req.body;

    const problem = validateNewWarehouse(name, location);
    if (problem) {
      return sendError(res, 400, 'VALIDATION_ERROR', problem);
    }

    // Business rule: two warehouses cannot have the same name
    if (await warehouseService.findWarehouseByName(name)) {
      return sendError(res, 409, 'DUPLICATE_WAREHOUSE',
        `A warehouse named "${name.trim()}" already exists.`);
    }

    const warehouse = await warehouseService.createWarehouse({ name, location });
    res.status(201).json(warehouse);
  } catch (error) {
    next(error);
  }
}

// PATCH /api/warehouses/:id with { name, location } -> 200 with the changed warehouse,
// or 400 / 404 / 409 / 415
async function updateWarehouse(req, res, next) {
  try {
    if (!req.is('application/json')) {
      return sendError(res, 415, 'UNSUPPORTED_MEDIA_TYPE',
        'Content-Type must be application/json.');
    }

    const warehouse = await warehouseService.findWarehouseById(req.params.id);
    if (!warehouse) {
      return sendError(res, 404, 'WAREHOUSE_NOT_FOUND', 'Warehouse not found.');
    }

    const { name, location } = req.body;
    if (name === undefined && location === undefined) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Send a new name, a new location, or both.');
    }
    const problem = (name !== undefined && checkText(name, 'Name', 2, 100)) ||
      (location !== undefined && checkText(location, 'Location', 2, 100));
    if (problem) {
      return sendError(res, 400, 'VALIDATION_ERROR', problem);
    }

    // Business rule: two warehouses cannot have the same name
    if (name !== undefined) {
      const owner = await warehouseService.findWarehouseByName(name);
      if (owner && owner.warehouseId !== warehouse.warehouseId) {
        return sendError(res, 409, 'DUPLICATE_WAREHOUSE',
          `A warehouse named "${name.trim()}" already exists.`);
      }
    }

    const updated = await warehouseService.updateWarehouse(warehouse, { name, location });
    res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listWarehouses,
  createWarehouse,
  updateWarehouse
};
