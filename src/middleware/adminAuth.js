const { AppError } = require('../errors');
const config = require('../config');

function adminAuth(req, res, next) {
  if (!config.adminToken) {
    return next();
  }

  const authHeader = req.get('Authorization') || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : '';

  if (bearerToken === config.adminToken || req.query.token === config.adminToken) {
    return next();
  }

  return next(new AppError(401, 'UNAUTHORIZED', 'Invalid or missing admin token.'));
}

module.exports = adminAuth;
