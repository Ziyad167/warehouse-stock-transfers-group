const transferService = require('../services/transferService');
const inventoryClient = require('../services/inventoryClient');

// DISPATCHED and RECEIVED are set later by the Tracking service (Saif)
const STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'DISPATCHED', 'RECEIVED'];

// Sends an error in the same shape everywhere: { error: { code, message } }
function sendError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

function isFilledText(value) {
  return typeof value === 'string' && value.trim() !== '';
}

// Validates a new transfer request; returns an error message or null
function validateNewTransfer({ fromWarehouseId, toWarehouseId, itemId, quantity, note }) {
  if (!isFilledText(fromWarehouseId)) {
    return 'fromWarehouseId is required.';
  }
  if (!isFilledText(toWarehouseId)) {
    return 'toWarehouseId is required.';
  }
  if (fromWarehouseId === toWarehouseId) {
    return 'The source and destination warehouses must be different.';
  }
  if (!isFilledText(itemId)) {
    return 'itemId is required.';
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    return 'Quantity must be a whole number of 1 or more.';
  }
  if (note !== undefined && (typeof note !== 'string' || note.length > 200)) {
    return 'Note must be text of at most 200 characters.';
  }
  return null;
}

// POST /api/transfers -> 201 with the new PENDING request, or 400 / 404 / 415
async function createTransfer(req, res, next) {
  try {
    if (!req.is('application/json')) {
      return sendError(res, 415, 'UNSUPPORTED_MEDIA_TYPE',
        'Content-Type must be application/json.');
    }

    const problem = validateNewTransfer(req.body);
    if (problem) {
      return sendError(res, 400, 'VALIDATION_ERROR', problem);
    }

    // Ask the Inventory service if the warehouses and the item really exist
    const { fromWarehouseId, toWarehouseId, itemId, quantity, note } = req.body;
    if (!await inventoryClient.findWarehouse(req.token, fromWarehouseId)) {
      return sendError(res, 404, 'WAREHOUSE_NOT_FOUND', 'Source warehouse not found.');
    }
    if (!await inventoryClient.findWarehouse(req.token, toWarehouseId)) {
      return sendError(res, 404, 'WAREHOUSE_NOT_FOUND', 'Destination warehouse not found.');
    }
    if (!await inventoryClient.findItem(req.token, itemId)) {
      return sendError(res, 404, 'ITEM_NOT_FOUND', 'Item not found.');
    }

    const transfer = await transferService.createTransfer({
      fromWarehouseId, toWarehouseId, itemId, quantity, note,
      requestedBy: req.user.username
    });
    res.status(201).json(transfer);
  } catch (error) {
    next(error);
  }
}

// GET /api/transfers?status=PENDING&warehouseId=WH-101 -> 200 with the matching requests
async function listTransfers(req, res, next) {
  try {
    const status = req.query.status ? String(req.query.status).toUpperCase() : undefined;
    if (status && !STATUSES.includes(status)) {
      return sendError(res, 400, 'VALIDATION_ERROR',
        `Status must be one of: ${STATUSES.join(', ')}.`);
    }
    const warehouseId = req.query.warehouseId ? String(req.query.warehouseId) : undefined;

    const transfers = await transferService.listTransfers({ status, warehouseId });
    res.status(200).json(transfers);
  } catch (error) {
    next(error);
  }
}

// GET /api/transfers/:id -> 200 with one request, or 404
async function getTransfer(req, res, next) {
  try {
    const transfer = await transferService.findTransferById(req.params.id);
    if (!transfer) {
      return sendError(res, 404, 'TRANSFER_NOT_FOUND', 'Transfer request not found.');
    }
    res.status(200).json(transfer);
  } catch (error) {
    next(error);
  }
}

// PATCH /api/transfers/:id/decision with { "decision": "approve" } or
// { "decision": "reject", "reason": "..." } -> 200, or 400 / 403 / 404 / 409 / 415
async function decideTransfer(req, res, next) {
  try {
    if (!req.is('application/json')) {
      return sendError(res, 415, 'UNSUPPORTED_MEDIA_TYPE',
        'Content-Type must be application/json.');
    }

    const { decision, reason } = req.body;
    if (decision !== 'approve' && decision !== 'reject') {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Decision must be "approve" or "reject".');
    }
    if (decision === 'reject' &&
        (typeof reason !== 'string' || reason.trim().length < 3 || reason.length > 200)) {
      return sendError(res, 400, 'VALIDATION_ERROR',
        'A reason of 3 to 200 characters is required to reject.');
    }

    const transfer = await transferService.findTransferById(req.params.id);
    if (!transfer) {
      return sendError(res, 404, 'TRANSFER_NOT_FOUND', 'Transfer request not found.');
    }

    // Business rule: a request can be decided only once
    if (transfer.status !== 'PENDING') {
      return sendError(res, 409, 'ALREADY_DECIDED',
        `This request is already ${transfer.status}.`);
    }

    // Business rule: approve only if the source warehouse has enough stock right now
    if (decision === 'approve') {
      const stock = await inventoryClient.checkAvailability(
        req.token, transfer.fromWarehouseId, transfer.itemId, transfer.quantity);
      if (!stock.isAvailable) {
        return sendError(res, 409, 'INSUFFICIENT_STOCK',
          `The source warehouse has only ${stock.availableQuantity}, ` +
          `but ${transfer.quantity} are requested.`);
      }
    }

    const updated = await transferService.decideTransfer(transfer.transferId, {
      status: decision === 'approve' ? 'APPROVED' : 'REJECTED',
      decidedBy: req.user.username,
      reason
    });
    if (!updated) {
      return sendError(res, 409, 'ALREADY_DECIDED', 'This request was decided by someone else.');
    }
    res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
}

module.exports = { createTransfer, listTransfers, getTransfer, decideTransfer };
