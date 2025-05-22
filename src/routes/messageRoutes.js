const express = require('express');
const router = express.Router();
const {
    sendMessage,
    sendFileMessage,
    sendFileMessageBase64, 
    getMessages,
    getConversations,
    markMessageAsRead,
    getUnreadCount,
    deleteMessage,
    // New controller functions
    editMessage,
    addReaction,
    removeReaction,
    forwardMessage,
    searchMessages
} = require('../controllers/messageController');
const { protect } = require('../middleware/auth');
const { uploadMessageFile, uploadMessageFileMemory } = require('../middleware/uploadMessage');

// Apply protection middleware to all routes
router.use(protect);

// Message routes
router.post('/', sendMessage);
router.post('/file', uploadMessageFile, sendFileMessage);
router.post('/file/base64', uploadMessageFileMemory, sendFileMessageBase64); 
router.get('/conversations', getConversations);
router.get('/unread/count', getUnreadCount);
router.get('/search', searchMessages);
router.get('/:conversationId', getMessages);
router.put('/:messageId', editMessage);
router.put('/:messageId/read', markMessageAsRead);
router.post('/:messageId/reactions', addReaction);
router.delete('/:messageId/reactions/:reaction', removeReaction);
router.post('/:messageId/forward', forwardMessage);
router.delete('/:messageId', deleteMessage);

module.exports = router;