const express = require('express');
const warehouseController = require('../controllers/warehouses');
const inventoryController = require('../controllers/inventory');
const { requireLogin, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireLogin, warehouseController.listWarehouses);
router.post('/', requireLogin, requireRole('manager'), warehouseController.createWarehouse);
router.get('/:id/inventory', requireLogin, inventoryController.listWarehouseInventory);
router.patch('/:id', requireLogin, requireRole('manager'), warehouseController.updateWarehouse);

module.exports = router;