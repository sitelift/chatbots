const { getDb } = require('../db');
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

const FACTS_KEYS = ['hours', 'contact', 'faq', 'products', 'misc'];

const FIELD_MAP = {
  name: 'name',
  websiteUrl: 'website_url',
  welcomeMessage: 'welcome_message',
  brandColor: 'brand_color',
  model: 'model',
  baseUrl: 'base_url',
  temperature: 'temperature',
  maxTokens: 'max_tokens',
};

function parseFacts(json) {
  const base = { hours: '', contact: '', faq: '', products: '', misc: '' };
  if (!json) return base;
  try {
    return { ...base, ...(JSON.parse(json) || {}) };
  } catch (e) {
    return base;
  }
}

function normalizeFacts(facts) {
  const out = {};
  for (const key of FACTS_KEYS) {
    out[key] = typeof facts[key] === 'string' ? facts[key] : '';
  }
  return out;
}

function assembleFacts(facts) {
  const sections = [
    ['Business hours', facts.hours],
    ['Contact', facts.contact],
    ['FAQ', facts.faq],
    ['Products and services', facts.products],
    ['Additional information', facts.misc],
  ];
  return sections
    .filter(([, v]) => typeof v === 'string' && v.trim() !== '')
    .map(([h, v]) => `${h}:\n${v.trim()}`)
    .join('\n\n');
}

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
    businessFacts: row.business_facts || '',
    facts: parseFacts(row.facts_json),
    model: row.model,
    baseUrl: row.base_url,
    temperature: row.temperature,
    maxTokens: row.max_tokens,
    enabled: !!row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeList(row) {
  const serialized = serializeAdmin(row);
  delete serialized.businessFacts;
  delete serialized.facts;
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

  const now = new Date().toISOString();
  const id = generateId('ch');

  let businessFacts = input.businessFacts || DEFAULTS.businessFacts;
  let factsJson = null;
  if (input.facts && typeof input.facts === 'object') {
    const facts = normalizeFacts(input.facts);
    factsJson = JSON.stringify(facts);
    businessFacts = assembleFacts(facts);
  }

  const row = {
    id,
    name: input.name,
    website_url: input.websiteUrl || DEFAULTS.websiteUrl,
    welcome_message: input.welcomeMessage || DEFAULTS.welcomeMessage,
    brand_color: input.brandColor || DEFAULTS.brandColor,
    business_facts: businessFacts,
    facts_json: factsJson,
    model: input.model || DEFAULTS.model,
    base_url: input.baseUrl || DEFAULTS.baseUrl,
    temperature: input.temperature !== undefined ? input.temperature : DEFAULTS.temperature,
    max_tokens: input.maxTokens !== undefined ? input.maxTokens : DEFAULTS.maxTokens,
    enabled: DEFAULTS.enabled,
    created_at: now,
    updated_at: now,
  };

  getDb()
    .prepare(
      'INSERT INTO chatbots (id, name, website_url, welcome_message, brand_color, business_facts, facts_json, model, base_url, temperature, max_tokens, enabled, created_at, updated_at) VALUES (@id, @name, @website_url, @welcome_message, @brand_color, @business_facts, @facts_json, @model, @base_url, @temperature, @max_tokens, @enabled, @created_at, @updated_at)'
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

  if (input.facts && typeof input.facts === 'object') {
    const facts = normalizeFacts(input.facts);
    sets.push('facts_json = ?', 'business_facts = ?');
    values.push(JSON.stringify(facts), assembleFacts(facts));
  } else if (Object.prototype.hasOwnProperty.call(input, 'businessFacts')) {
    sets.push('business_facts = ?', 'facts_json = ?');
    values.push(input.businessFacts, null);
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
