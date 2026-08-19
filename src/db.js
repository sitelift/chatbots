const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

let db = null;

function getDb() {
  if (db) return db;

  fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
  db = new DatabaseSync(config.databasePath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  return db;
}

function initSchema() {
  const database = getDb();

  database.exec(`
    CREATE TABLE IF NOT EXISTS chatbots (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      website_url TEXT,
      welcome_message TEXT,
      brand_color TEXT,
      business_facts TEXT,
      model TEXT,
      base_url TEXT,
      api_key_encrypted TEXT,
      api_key_hint TEXT,
      temperature REAL,
      max_tokens INTEGER,
      enabled INTEGER,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      chatbot_id TEXT NOT NULL REFERENCES chatbots(id) ON DELETE CASCADE,
      visitor_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      visitor_name TEXT,
      visitor_email TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_chatbot ON conversations(chatbot_id);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
  `);
}

module.exports = { getDb, initSchema };
