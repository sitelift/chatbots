const { getDb } = require('../db');
const { generateId } = require('../ids');

function createConversation(chatbotId, visitorId) {
  const id = generateId('cv');
  const now = new Date().toISOString();
  getDb()
    .prepare(
      'INSERT INTO conversations (id, chatbot_id, visitor_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(id, chatbotId, visitorId, 'open', now, now);
  return getDb().prepare('SELECT * FROM conversations WHERE id = ?').get(id);
}

function getConversationById(id) {
  return getDb().prepare('SELECT * FROM conversations WHERE id = ?').get(id) || null;
}

function addMessage(conversationId, role, content) {
  const id = generateId('msg');
  const now = new Date().toISOString();
  getDb()
    .prepare('INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, conversationId, role, content, now);
  getDb().prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, conversationId);
  return getDb().prepare('SELECT * FROM messages WHERE id = ?').get(id);
}

function recentMessages(conversationId, limit) {
  const rows = getDb()
    .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?')
    .all(conversationId, limit);
  return rows.reverse();
}

function listConversationsForChatbot(chatbotId) {
  const rows = getDb()
    .prepare('SELECT * FROM conversations WHERE chatbot_id = ? ORDER BY updated_at DESC')
    .all(chatbotId);
  const countStmt = getDb().prepare('SELECT COUNT(*) AS count FROM messages WHERE conversation_id = ?');
  return rows.map((row) => ({
    id: row.id,
    visitorId: row.visitor_id,
    visitorName: row.visitor_name,
    visitorEmail: row.visitor_email,
    status: row.status,
    messageCount: countStmt.get(row.id).count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

function getMessagesForConversation(conversationId) {
  const conversation = getDb().prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId);
  if (!conversation) return null;
  const messages = getDb()
    .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, rowid ASC')
    .all(conversationId);
  return {
    conversation: {
      id: conversation.id,
      chatbotId: conversation.chatbot_id,
      status: conversation.status,
    },
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.created_at,
    })),
  };
}

function captureLead(conversationId, userContent) {
  if (typeof userContent !== 'string') return;
  const conversation = getDb().prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId);
  if (!conversation) return;

  const emailMatch = userContent.match(/([\w.+-]+@[\w-]+\.[\w.-]+)/);
  const email = emailMatch ? emailMatch[1] : null;

  const nameMatch = userContent.match(
    /(?:\bmy name is\b|\bi'?m\b|\bi am\b|\bthis is\b)\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)/i
  );
  const name = nameMatch ? nameMatch[1].trim() : null;

  const sets = [];
  const values = [];

  if ((conversation.visitor_name === null || conversation.visitor_name === '') && name) {
    sets.push('visitor_name = ?');
    values.push(name);
  }
  if ((conversation.visitor_email === null || conversation.visitor_email === '') && email) {
    sets.push('visitor_email = ?');
    values.push(email);
  }

  if (sets.length === 0) return;

  sets.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(conversationId);

  getDb().prepare(`UPDATE conversations SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

function belongsToChatbot(conversationId, chatbotId) {
  const row = getDb().prepare('SELECT chatbot_id FROM conversations WHERE id = ?').get(conversationId);
  return Boolean(row && row.chatbot_id === chatbotId);
}

module.exports = {
  createConversation,
  getConversationById,
  addMessage,
  recentMessages,
  listConversationsForChatbot,
  getMessagesForConversation,
  captureLead,
  belongsToChatbot,
};
