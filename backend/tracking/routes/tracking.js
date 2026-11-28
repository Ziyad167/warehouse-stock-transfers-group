const express = require('express');
const trackingController = require('../controllers/tracking');
const { requireLogin, requireRole } = require('../middleware/auth');

const router = express.Router();

// Managers and staff both work on the warehouse floor, so both may dispatch and receive
router.patch('/transfers/:id/dispatch', requireLogin, requireRole('manager', 'staff'),
  trackingController.dispatchTransfer);
router.patch('/transfers/:id/receive', requireLogin, requireRole('manager', 'staff'),
  trackingController.receiveTransfer);

// Stock movement history
router.get('/items/:id/movements', requireLogin, trackingController.listItemMovements);
router.get('/movements', requireLogin, trackingController.listMovements);

// Dispatch and receipt messages that SNS put in the SQS queue
router.get('/messages', requireLogin, trackingController.listMessages);

module.exports = router;
