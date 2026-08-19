const express = require('express');
const path = require('path');
const config = require('./src/config');
const { initSchema } = require('./src/db');
const { errorResponse } = require('./src/errors');
const adminAuth = require('./src/middleware/adminAuth');
const publicRoutes = require('./src/routes/public');
const adminRoutes = require('./src/routes/admin');

initSchema();

const app = express();

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json());

app.get('/admin', adminAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/admin/', adminAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.use(publicRoutes);
app.use('/api/admin', adminRoutes);

app.use((req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found.' } });
});

app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body.' } });
  }
  const status = err && err.status ? err.status : 500;
  if (status >= 500) console.error(err);
  res.status(status).json(errorResponse(err));
});

app.listen(config.port, config.host, () => {
  console.log(`SiteLift listening on http://${config.host}:${config.port}`);
});
