const crypto = require('crypto');
const config = require('./config');

const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey() {
  if (!config.encryptionKey) {
    throw new Error('ENCRYPTION_KEY is not set. Generate one with: openssl rand -base64 32');
  }
  if (config.encryptionKey.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be 32 bytes (base64). Generate one with: openssl rand -base64 32');
  }
  return config.encryptionKey;
}

function encryptKey(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const encrypted = Buffer.concat([iv, authTag, ciphertext]).toString('base64');
  const hint = plaintext.slice(-4);
  return { encrypted, hint };
}

function decryptKey(encrypted) {
  const key = getKey();
  const blob = Buffer.from(encrypted, 'base64');
  const iv = blob.subarray(0, IV_LENGTH);
  const authTag = blob.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = blob.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

module.exports = { encryptKey, decryptKey };
