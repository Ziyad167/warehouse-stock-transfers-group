const express = require('express');
const alertController = require('../controllers/alerts');
const { requireLogin, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireLogin, requireRole('manager'), alertController.listAlerts);

module.exports = router;
