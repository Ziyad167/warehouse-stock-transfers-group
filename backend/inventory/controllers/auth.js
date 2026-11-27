const authService = require('../services/authService');

const ROLES = ['manager', 'staff'];

function sendError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

// POST /api/auth/login -> 200 with { token, username, role }, or 400 / 401 / 415
async function login(req, res, next) {
  try {
    if (!req.is('application/json')) {
      return sendError(res, 415, 'UNSUPPORTED_MEDIA_TYPE',
        'Content-Type must be application/json.');
    }

    const { username, password, role } = req.body;
    if (typeof username !== 'string' || typeof password !== 'string' ||
        username.trim() === '' || password === '') {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Username and password are required.');
    }
    // role is optional: the login page sends the role the user chose
    if (role !== undefined && !ROLES.includes(role)) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Role must be manager or staff.');
    }

    const user = await authService.checkLogin(username.trim(), password);
    if (!user) {
      // Same message for a wrong username or a wrong password,
      // so nobody can find out which usernames exist
      return sendError(res, 401, 'INVALID_LOGIN', 'Wrong username or password.');
    }

    // The chosen role must match the account; checked before any session is created
    if (role !== undefined && role !== user.role) {
      return sendError(res, 403, 'WRONG_ROLE',
        `This is a ${user.role} account. Choose ${user.role} to log in.`);
    }

    const token = await authService.createSession(user.username);
    res.status(200).json({ token, username: user.username, role: user.role });
  } catch (error) {
    next(error);
  }
}

// GET /api/auth/me -> 200 with the logged-in user
function me(req, res) {
  res.status(200).json(req.user);
}

// POST /api/auth/logout -> 200, the token stops working
async function logout(req, res, next) {
  try {
    await authService.deleteSession(req.token);
    res.status(200).json({ message: 'Logged out.' });
  } catch (error) {
    next(error);
  }
}

module.exports = { login, me, logout };