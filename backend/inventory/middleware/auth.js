const authService = require('../services/authService');

// Lets the request continue only if it has a valid "Authorization: Bearer <token>" header
async function requireLogin(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

    const user = token ? await authService.findUserByToken(token) : null;
    if (!user) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Please log in first.' }
      });
    }

    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    next(error);
  }
}

// Lets the request continue only if the user's role is one of the allowed roles
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