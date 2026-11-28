const express = require('express');
const transferController = require('../controllers/transfers');
const { requireLogin, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireLogin, transferController.listTransfers);
router.post('/', requireLogin, transferController.createTransfer);
router.get('/:id', requireLogin, transferController.getTransfer);
router.patch('/:id/decision', requireLogin, requireRole('manager'), transferController.decideTransfer);
router.delete('/:id', requireLogin, transferController.cancelTransfer);

module.exports = router;
