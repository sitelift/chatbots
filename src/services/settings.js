const { getDb } = require('../db');
const { encryptKey, decryptKey } = require('../crypto');

const KEY_NAME = 'openai_api_key';
const BASE_URL_NAME = 'openai_base_url';

function getRow(name) {
  return getDb().prepare('SELECT * FROM settings WHERE key = ?').get(name) || null;
}

function setRow(name, value, hint) {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      'INSERT INTO settings (key, value, hint, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, hint = excluded.hint, updated_at = excluded.updated_at'
    )
    .run(name, value, hint, now);
}

function getOpenaiApiKey() {
  const row = getRow(KEY_NAME);
  if (!row || !row.value) return null;
  return decryptKey(row.value);
}

function getOpenaiBaseUrl() {
  const row = getRow(BASE_URL_NAME);
  return row && row.value ? row.value : null;
}

function getSettings() {
  const keyRow = getRow(KEY_NAME);
  const urlRow = getRow(BASE_URL_NAME);
  return {
    hasApiKey: Boolean(keyRow && keyRow.value),
    apiKeyHint: keyRow && keyRow.hint ? keyRow.hint : null,
    baseUrl: urlRow && urlRow.value ? urlRow.value : null,
  };
}

function updateSettings({ apiKey, baseUrl }) {
  if (typeof apiKey === 'string' && apiKey.trim() !== '') {
    const { encrypted, hint } = encryptKey(apiKey);
    setRow(KEY_NAME, encrypted, hint);
  }
  if (typeof baseUrl === 'string') {
    if (baseUrl.trim() === '') {
      getDb().prepare('DELETE FROM settings WHERE key = ?').run(BASE_URL_NAME);
    } else {
      setRow(BASE_URL_NAME, baseUrl.trim(), null);
    }
  }
  return getSettings();
}

module.exports = { getSettings, updateSettings, getOpenaiApiKey, getOpenaiBaseUrl };
