const express = require('express');
const inventoryController = require('../controllers/inventory');
const { requireLogin, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/availability', requireLogin, inventoryController.checkAvailability);
router.post('/', requireLogin, requireRole('manager'), inventoryController.createInventoryRecord);
router.patch('/:id', requireLogin, requireRole('manager', 'staff'), inventoryController.updateStock);
router.delete('/:id', requireLogin, requireRole('manager'), inventoryController.deleteRecord);

module.exports = router;