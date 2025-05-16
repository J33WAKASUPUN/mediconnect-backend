const express = require('express');
const router = express.Router();
const {
    sendMessage,
    sendFileMessage,
    getMessages,
    getConversations,
    markMessageAsRead,
    getUnreadCount,
    deleteMessage
} = require('../controllers/messageController');
const { protect } = require('../middleware/auth');
const { uploadMessageFile } = require('../middleware/uploadMessage');

// Apply protection middleware to all routes
router.use(protect);

// Message routes
router.post('/', sendMessage);
router.post('/file', uploadMessageFile, sendFileMessage);
router.get('/conversations', getConversations);
router.get('/unread/count', getUnreadCount);
router.get('/:conversationId', getMessages);
router.put('/:messageId/read', markMessageAsRead);
router.delete('/:messageId', deleteMessage);

module.exports = router;