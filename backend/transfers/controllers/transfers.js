const transferService = require('../services/transferService');
const inventoryClient = require('../services/inventoryClient');

const STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'DISPATCHED', 'RECEIVED'];

function sendError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

function isFilledText(value) {
  return typeof value === 'string' && value.trim() !== '';
}

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

    if (transfer.status !== 'PENDING') {
      return sendError(res, 409, 'ALREADY_DECIDED',
        `This request is already ${transfer.status}.`);
    }

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

async function cancelTransfer(req, res, next) {
  try {
    const transfer = await transferService.findTransferById(req.params.id);
    if (!transfer) {
      return sendError(res, 404, 'TRANSFER_NOT_FOUND', 'Transfer request not found.');
    }

    if (transfer.requestedBy !== req.user.username) {
      return sendError(res, 403, 'NOT_YOUR_REQUEST', 'Only the person who asked can cancel this request.');
    }

    if (transfer.status !== 'PENDING') {
      return sendError(res, 409, 'ALREADY_DECIDED',
        `This request is already ${transfer.status}, so it cannot be cancelled.`);
    }

    const deleted = await transferService.deleteTransfer(transfer.transferId);
    if (!deleted) {
      return sendError(res, 409, 'ALREADY_DECIDED', 'A manager decided this request just now.');
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

module.exports = { createTransfer, listTransfers, getTransfer, decideTransfer, cancelTransfer };
