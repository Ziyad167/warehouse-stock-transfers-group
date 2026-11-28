const express = require('express');
const alertController = require('../controllers/alerts');
const { requireLogin, requireRole } = require('../middleware/auth');

const router = express.Router();

// Low-stock alerts are for managers, who decide what to restock or transfer
router.get('/', requireLogin, requireRole('manager'), alertController.listAlerts);

module.exports = router;
