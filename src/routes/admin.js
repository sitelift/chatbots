const express = require('express');
const { AppError } = require('../errors');
const {
  listChatbots,
  getChatbotAdmin,
  createChatbot,
  updateChatbot,
  deleteChatbot,
} = require('../services/chatbots');
const {
  listConversationsForChatbot,
  getMessagesForConversation,
} = require('../services/conversations');
const settings = require('../services/settings');
const { fetchPageText } = require('../scraper');

const router = express.Router();

router.use(require('../middleware/adminAuth'));

router.get('/settings', (req, res) => {
  res.json(settings.getSettings());
});

router.put('/settings', (req, res) => {
  res.json(settings.updateSettings(req.body || {}));
});

router.get('/chatbots', (req, res) => {
  res.json({ chatbots: listChatbots() });
});

router.post('/chatbots', (req, res) => {
  res.status(201).json(createChatbot(req.body));
});

router.get('/chatbots/:chatbotId', (req, res) => {
  const chatbot = getChatbotAdmin(req.params.chatbotId);
  if (!chatbot) {
    throw new AppError(404, 'CHATBOT_NOT_FOUND', 'Chatbot not found.');
  }
  res.json(chatbot);
});

router.put('/chatbots/:chatbotId', (req, res) => {
  const chatbot = updateChatbot(req.params.chatbotId, req.body);
  if (!chatbot) {
    throw new AppError(404, 'CHATBOT_NOT_FOUND', 'Chatbot not found.');
  }
  res.json(chatbot);
});

router.delete('/chatbots/:chatbotId', (req, res) => {
  const deleted = deleteChatbot(req.params.chatbotId);
  if (!deleted) {
    throw new AppError(404, 'CHATBOT_NOT_FOUND', 'Chatbot not found.');
  }
  res.json({ deleted: true });
});

router.get('/chatbots/:chatbotId/conversations', (req, res) => {
  const chatbot = getChatbotAdmin(req.params.chatbotId);
  if (!chatbot) {
    throw new AppError(404, 'CHATBOT_NOT_FOUND', 'Chatbot not found.');
  }
  res.json({ conversations: listConversationsForChatbot(req.params.chatbotId) });
});

router.get('/conversations/:conversationId/messages', (req, res) => {
  const result = getMessagesForConversation(req.params.conversationId);
  if (!result) {
    throw new AppError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found.');
  }
  res.json(result);
});

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.post(
  '/chatbots/:chatbotId/scrape',
  asyncHandler(async (req, res) => {
    const chatbot = getChatbotAdmin(req.params.chatbotId);
    if (!chatbot) {
      throw new AppError(404, 'CHATBOT_NOT_FOUND', 'Chatbot not found.');
    }
    const url = (req.body && req.body.url) || chatbot.websiteUrl;
    if (!url) {
      throw new AppError(400, 'SCRAPE_FAILED', 'No URL provided. Set a website URL or pass one.');
    }
    const text = await fetchPageText(url);
    res.json({ text });
  })
);

module.exports = router;
