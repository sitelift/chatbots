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

const router = express.Router();

router.use(require('../middleware/adminAuth'));

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

module.exports = router;
