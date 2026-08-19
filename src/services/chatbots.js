const { getDb } = require('../db');
const { encryptKey } = require('../crypto');
const { generateId } = require('../ids');
const { AppError } = require('../errors');

const DEFAULTS = {
  model: 'gpt-4o-mini',
  baseUrl: 'https://api.openai.com/v1',
  temperature: 0.7,
  maxTokens: 512,
  brandColor: '#0f172a',
  welcomeMessage: '',
  enabled: 1,
  websiteUrl: '',
  businessFacts: '',
};

const FIELD_MAP = {
  name: 'name',
  websiteUrl: 'website_url',
  welcomeMessage: 'welcome_message',
  brandColor: 'brand_color',
  businessFacts: 'business_facts',
  model: 'model',
  baseUrl: 'base_url',
  temperature: 'temperature',
  maxTokens: 'max_tokens',
};

function getChatbotById(id) {
  return getDb().prepare('SELECT * FROM chatbots WHERE id = ?').get(id) || null;
}

function getChatbotPublic(id) {
  const row = getChatbotById(id);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    welcomeMessage: row.welcome_message,
    brandColor: row.brand_color,
    enabled: !!row.enabled,
  };
}

function serializeAdmin(row) {
  return {
    id: row.id,
    name: row.name,
    websiteUrl: row.website_url,
    welcomeMessage: row.welcome_message,
    brandColor: row.brand_color,
    businessFacts: row.business_facts,
    model: row.model,
    baseUrl: row.base_url,
    temperature: row.temperature,
    maxTokens: row.max_tokens,
    enabled: !!row.enabled,
    hasApiKey: !!row.api_key_encrypted,
    apiKeyHint: row.api_key_hint || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeList(row) {
  const serialized = serializeAdmin(row);
  delete serialized.businessFacts;
  return serialized;
}

function getChatbotAdmin(id) {
  const row = getChatbotById(id);
  return row ? serializeAdmin(row) : null;
}

function listChatbots() {
  const rows = getDb().prepare('SELECT * FROM chatbots ORDER BY created_at DESC').all();
  return rows.map(serializeList);
}

function createChatbot(input) {
  if (typeof input.name !== 'string' || input.name.trim() === '') {
    throw new AppError(400, 'VALIDATION', 'name is required.');
  }
  if (typeof input.apiKey !== 'string' || input.apiKey.trim() === '') {
    throw new AppError(400, 'VALIDATION', 'apiKey is required.');
  }

  const { encrypted, hint } = encryptKey(input.apiKey);
  const now = new Date().toISOString();
  const id = generateId('ch');

  const row = {
    id,
    name: input.name,
    website_url: input.websiteUrl || DEFAULTS.websiteUrl,
    welcome_message: input.welcomeMessage || DEFAULTS.welcomeMessage,
    brand_color: input.brandColor || DEFAULTS.brandColor,
    business_facts: input.businessFacts || DEFAULTS.businessFacts,
    model: input.model || DEFAULTS.model,
    base_url: input.baseUrl || DEFAULTS.baseUrl,
    api_key_encrypted: encrypted,
    api_key_hint: hint,
    temperature: input.temperature !== undefined ? input.temperature : DEFAULTS.temperature,
    max_tokens: input.maxTokens !== undefined ? input.maxTokens : DEFAULTS.maxTokens,
    enabled: DEFAULTS.enabled,
    created_at: now,
    updated_at: now,
  };

  getDb()
    .prepare(
      'INSERT INTO chatbots (id, name, website_url, welcome_message, brand_color, business_facts, model, base_url, api_key_encrypted, api_key_hint, temperature, max_tokens, enabled, created_at, updated_at) VALUES (@id, @name, @website_url, @welcome_message, @brand_color, @business_facts, @model, @base_url, @api_key_encrypted, @api_key_hint, @temperature, @max_tokens, @enabled, @created_at, @updated_at)'
    )
    .run(row);

  return getChatbotAdmin(id);
}

function updateChatbot(id, input) {
  const existing = getChatbotById(id);
  if (!existing) return null;

  const sets = [];
  const values = [];

  for (const [camel, column] of Object.entries(FIELD_MAP)) {
    if (Object.prototype.hasOwnProperty.call(input, camel)) {
      sets.push(`${column} = ?`);
      values.push(input[camel]);
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, 'enabled')) {
    sets.push('enabled = ?');
    values.push(input.enabled ? 1 : 0);
  }

  if (typeof input.apiKey === 'string' && input.apiKey.trim() !== '') {
    const { encrypted, hint } = encryptKey(input.apiKey);
    sets.push('api_key_encrypted = ?', 'api_key_hint = ?');
    values.push(encrypted, hint);
  }

  sets.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);

  getDb().prepare(`UPDATE chatbots SET ${sets.join(', ')} WHERE id = ?`).run(...values);

  return getChatbotAdmin(id);
}

function deleteChatbot(id) {
  const info = getDb().prepare('DELETE FROM chatbots WHERE id = ?').run(id);
  return info.changes > 0;
}

module.exports = {
  getChatbotById,
  getChatbotPublic,
  getChatbotAdmin,
  listChatbots,
  createChatbot,
  updateChatbot,
  deleteChatbot,
  serializeAdmin,
  serializeList,
};
