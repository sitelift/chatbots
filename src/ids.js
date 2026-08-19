const crypto = require('crypto');

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

function generateId(prefix) {
  const bytes = crypto.randomBytes(22);
  let token = '';
  for (let i = 0; i < bytes.length; i += 1) {
    token += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return `${prefix}_${token}`;
}

module.exports = { generateId };
