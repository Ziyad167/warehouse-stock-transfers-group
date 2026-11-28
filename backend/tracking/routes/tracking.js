const express = require('express');
const trackingController = require('../controllers/tracking');
const { requireLogin, requireRole } = require('../middleware/auth');

const router = express.Router();

router.patch('/transfers/:id/dispatch', requireLogin, requireRole('manager', 'staff'),
  trackingController.dispatchTransfer);
router.patch('/transfers/:id/receive', requireLogin, requireRole('manager', 'staff'),
  trackingController.receiveTransfer);

router.get('/items/:id/movements', requireLogin, trackingController.listItemMovements);
router.get('/movements', requireLogin, trackingController.listMovements);

router.get('/messages', requireLogin, trackingController.listMessages);

module.exports = router;
