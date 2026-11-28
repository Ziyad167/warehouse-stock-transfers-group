const transferService = require('../services/transferService');
const movementService = require('../services/movementService');
const inventoryClient = require('../services/inventoryClient');
const notificationService = require('../services/notificationService');

// Sends an error in the same shape everywhere: { error: { code, message } }
function sendError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

// Turns an error answer from the Inventory service into our own error answer
function sendInventoryError(res, result) {
  const status = result.status >= 400 && result.status < 500 ? result.status : 502;
  const code = result.body?.error?.code || 'INVENTORY_ERROR';
  const message = result.body?.error?.message || 'The Inventory service could not change the stock.';
  return sendError(res, status, code, message);
}

// Looks up warehouse names, so messages say "Cairo Main Warehouse" and not "WH-101"
async function warehouseNames(token) {
  const names = {};
  const warehouses = await inventoryClient.listWarehouses(token);
  warehouses.forEach((warehouse) => {
    names[warehouse.warehouseId] = warehouse.name;
  });
  return names;
}

// Explains why a transfer cannot be dispatched or received in its current status
function statusProblem(transfer) {
  const reasons = {
    PENDING: 'This transfer is not approved yet.',
    REJECTED: 'This transfer was rejected, so it cannot be dispatched or received.',
    APPROVED: 'This transfer has not been dispatched yet.',
    DISPATCHED: 'This transfer is already dispatched.',
    RECEIVED: 'This transfer is already received.'
  };
  return reasons[transfer.status] || `This transfer is ${transfer.status}.`;
}

// PATCH /api/transfers/:id/dispatch
// -> 200 with the DISPATCHED transfer and the OUT movement, or 404 / 409
async function dispatchTransfer(req, res, next) {
  try {
    const transfer = await transferService.findTransferById(req.params.id);
    if (!transfer) {
      return sendError(res, 404, 'TRANSFER_NOT_FOUND', 'Transfer request not found.');
    }

    // Business rule: only an APPROVED transfer can be dispatched, and only once
    if (transfer.status !== 'APPROVED') {
      return sendError(res, 409, 'WRONG_STATUS', statusProblem(transfer));
    }

    // Business rule: the source warehouse must still have enough stock
    const itemStock = await inventoryClient.findItemStock(req.token, transfer.itemId);
    if (!itemStock) {
      return sendError(res, 404, 'ITEM_NOT_FOUND', 'The item of this transfer no longer exists.');
    }
    const source = itemStock.stock.find((record) => record.warehouseId === transfer.fromWarehouseId);
    const available = source ? source.quantity : 0;
    if (available < transfer.quantity) {
      return sendError(res, 409, 'INSUFFICIENT_STOCK',
        `The source warehouse has only ${available}, but ${transfer.quantity} must be dispatched.`);
    }

    // 1) Mark it DISPATCHED (only works if it is still APPROVED)
    const dispatched = await transferService.moveStatus(transfer.transferId, 'APPROVED', 'DISPATCHED', {
      dispatchedBy: req.user.username,
      dispatchedAt: new Date().toISOString(),
      dispatchedQuantity: transfer.quantity
    });
    if (!dispatched) {
      return sendError(res, 409, 'WRONG_STATUS', 'Someone else dispatched this transfer just now.');
    }

    // 2) Take the units out of the source warehouse (Inventory service)
    const change = await inventoryClient.changeStock(req.token, source.inventoryId, -transfer.quantity);
    if (change.status !== 200) {
      // The stock did not change, so put the transfer back to APPROVED
      await transferService.undoStatus(transfer.transferId, 'DISPATCHED', 'APPROVED',
        ['dispatchedBy', 'dispatchedAt', 'dispatchedQuantity']);
      return sendInventoryError(res, change);
    }

    // 3) Write it in the movement history
    const movement = await movementService.recordMovement({
      itemId: transfer.itemId,
      transferId: transfer.transferId,
      warehouseId: transfer.fromWarehouseId,
      movementType: 'OUT',
      quantity: transfer.quantity,
      performedBy: req.user.username
    });

    // 4) Tell the warehouses (SNS on Floci)
    const names = await warehouseNames(req.token);
    const item = itemStock.item;
    const notificationSent = await notificationService.notify('Transfer dispatched',
      `${transfer.quantity} x ${item.name} (${item.sku}) left ${names[transfer.fromWarehouseId]} ` +
      `for ${names[transfer.toWarehouseId]}. Dispatched by ${req.user.username}. ` +
      `Transfer ${transfer.transferId}.`);

    res.status(200).json({
      transfer: dispatched,
      movement,
      notificationSent,
      lowStockAlert: change.body.lowStockAlert === true
    });
  } catch (error) {
    next(error);
  }
}

// Validates the receipt; returns an error message or null
function validateReceipt(receivedQuantity, dispatchedQuantity, note) {
  if (!Number.isInteger(receivedQuantity) || receivedQuantity < 0) {
    return 'receivedQuantity must be a whole number of 0 or more.';
  }
  if (receivedQuantity > dispatchedQuantity) {
    return `Only ${dispatchedQuantity} were dispatched, so at most ${dispatchedQuantity} can be received.`;
  }
  if (note !== undefined && (typeof note !== 'string' || note.length > 200)) {
    return 'Note must be text of at most 200 characters.';
  }
  // Business rule: if units are missing, the receiver must say what happened
  if (receivedQuantity < dispatchedQuantity && (typeof note !== 'string' || note.trim().length < 3)) {
    return 'Some units are missing: add a note of 3 to 200 characters saying what happened.';
  }
  return null;
}

// PATCH /api/transfers/:id/receive with { "receivedQuantity": 10, "note": "..." }
// -> 200 with the RECEIVED transfer and the IN movement, or 400 / 403 / 404 / 409 / 415
async function receiveTransfer(req, res, next) {
  try {
    if (!req.is('application/json')) {
      return sendError(res, 415, 'UNSUPPORTED_MEDIA_TYPE',
        'Content-Type must be application/json.');
    }

    const transfer = await transferService.findTransferById(req.params.id);
    if (!transfer) {
      return sendError(res, 404, 'TRANSFER_NOT_FOUND', 'Transfer request not found.');
    }

    // Business rule: only a DISPATCHED transfer can be received, and only once
    if (transfer.status !== 'DISPATCHED') {
      return sendError(res, 409, 'WRONG_STATUS', statusProblem(transfer));
    }

    // If receivedQuantity is not sent, everything that was dispatched arrived
    const dispatchedQuantity = transfer.dispatchedQuantity;
    const receivedQuantity = req.body.receivedQuantity === undefined
      ? dispatchedQuantity
      : req.body.receivedQuantity;
    const note = req.body.note;

    const problem = validateReceipt(receivedQuantity, dispatchedQuantity, note);
    if (problem) {
      return sendError(res, 400, 'VALIDATION_ERROR', problem);
    }

    // Business rule: the person who dispatched cannot also confirm the arrival
    if (transfer.dispatchedBy === req.user.username) {
      return sendError(res, 403, 'SAME_PERSON',
        'You dispatched this transfer, so someone else must confirm that it arrived.');
    }

    const itemStock = await inventoryClient.findItemStock(req.token, transfer.itemId);
    if (!itemStock) {
      return sendError(res, 404, 'ITEM_NOT_FOUND', 'The item of this transfer no longer exists.');
    }
    const destination = itemStock.stock.find((record) => record.warehouseId === transfer.toWarehouseId);

    // 1) Mark it RECEIVED (only works if it is still DISPATCHED)
    const missingQuantity = dispatchedQuantity - receivedQuantity;
    const fields = {
      receivedBy: req.user.username,
      receivedAt: new Date().toISOString(),
      receivedQuantity,
      missingQuantity
    };
    if (typeof note === 'string' && note.trim() !== '') {
      fields.receiptNote = note.trim();
    }
    const received = await transferService.moveStatus(transfer.transferId, 'DISPATCHED', 'RECEIVED', fields);
    if (!received) {
      return sendError(res, 409, 'WRONG_STATUS', 'Someone else received this transfer just now.');
    }

    // 2) Add the units that arrived to the destination warehouse (Inventory service)
    if (receivedQuantity > 0) {
      const result = destination
        ? await inventoryClient.changeStock(req.token, destination.inventoryId, receivedQuantity)
        : await inventoryClient.createStockRecord(req.token, transfer.toWarehouseId, transfer.itemId, receivedQuantity);

      if (result.status !== 200 && result.status !== 201) {
        // The stock did not change, so put the transfer back to DISPATCHED
        await transferService.undoStatus(transfer.transferId, 'RECEIVED', 'DISPATCHED', Object.keys(fields));
        if (!destination && result.status === 403) {
          return sendError(res, 403, 'MANAGER_NEEDED',
            'This warehouse does not stock this item yet, so a manager must receive this first delivery.');
        }
        return sendInventoryError(res, result);
      }
    }

    // 3) Write it in the movement history
    const movement = await movementService.recordMovement({
      itemId: transfer.itemId,
      transferId: transfer.transferId,
      warehouseId: transfer.toWarehouseId,
      movementType: 'IN',
      quantity: receivedQuantity,
      performedBy: req.user.username,
      note: fields.receiptNote
    });

    // 4) Tell the warehouses (SNS on Floci)
    const names = await warehouseNames(req.token);
    const item = itemStock.item;
    let message = `${receivedQuantity} of ${dispatchedQuantity} x ${item.name} (${item.sku}) arrived at ` +
      `${names[transfer.toWarehouseId]}. Received by ${req.user.username}. Transfer ${transfer.transferId}.`;
    if (missingQuantity > 0) {
      message = `${message} ${missingQuantity} missing: ${fields.receiptNote}`;
    }
    const notificationSent = await notificationService.notify('Transfer received', message);

    res.status(200).json({ transfer: received, movement, notificationSent });
  } catch (error) {
    next(error);
  }
}

// GET /api/items/:id/movements -> 200 with the item and its movements (newest first), or 404
async function listItemMovements(req, res, next) {
  try {
    const itemStock = await inventoryClient.findItemStock(req.token, req.params.id);
    if (!itemStock) {
      return sendError(res, 404, 'ITEM_NOT_FOUND', 'Item not found.');
    }
    const movements = await movementService.listMovements({ itemId: itemStock.item.itemId });
    res.status(200).json({ item: itemStock.item, movements });
  } catch (error) {
    next(error);
  }
}

// GET /api/movements?warehouseId=WH-101&itemId=ITM-101 -> 200 with the movements (newest first)
async function listMovements(req, res, next) {
  try {
    const warehouseId = req.query.warehouseId ? String(req.query.warehouseId) : undefined;
    const itemId = req.query.itemId ? String(req.query.itemId) : undefined;
    const movements = await movementService.listMovements({ itemId, warehouseId });
    res.status(200).json(movements);
  } catch (error) {
    next(error);
  }
}

// GET /api/messages -> 200 with the new dispatch and receipt messages from SQS,
// or 503 if the queue cannot be read
async function listMessages(req, res) {
  try {
    const messages = await notificationService.readMessages();
    res.status(200).json(messages);
  } catch (error) {
    console.warn(`Reading messages failed: ${error.message}`);
    res.status(503).json({
      error: { code: 'MESSAGES_UNAVAILABLE', message: 'The message queue cannot be read right now.' }
    });
  }
}

module.exports = { dispatchTransfer, receiveTransfer, listItemMovements, listMovements, listMessages };
