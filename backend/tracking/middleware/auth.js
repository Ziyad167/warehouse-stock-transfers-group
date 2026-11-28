const inventoryClient = require('../services/inventoryClient');

async function requireLogin(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

    const user = token ? await inventoryClient.getCurrentUser(token) : null;
    if (!user) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Please log in first.' }
      });
    }

    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    res.status(503).json({
      error: { code: 'INVENTORY_UNAVAILABLE', message: 'The Inventory service is not reachable.' }
    });
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Your role is not allowed to do this.' }
      });
    }
    next();
  };
}

module.exports = { requireLogin, requireRole };
