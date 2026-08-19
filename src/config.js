require('dotenv').config();
const path = require('path');

const config = {
  host: process.env.HOST || '127.0.0.1',
  port: parseInt(process.env.PORT || '3000', 10),
  databasePath: process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'sitelift.db'),
  adminToken: process.env.ADMIN_TOKEN || '',
  encryptionKey: process.env.ENCRYPTION_KEY ? Buffer.from(process.env.ENCRYPTION_KEY, 'base64') : null,
  maxContentLength: 2000,
  rateLimitMax: 20,
  rateLimitWindowMs: 60 * 1000,
  contextWindow: 20,
};

module.exports = config;
