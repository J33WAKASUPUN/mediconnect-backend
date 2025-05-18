const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const Appointment = require('../models/Appointment');
const { getCurrentUTC } = require('../utils/dateTime');
const logger = require('../utils/logger');
const fs = require('fs');

// @desc    Send a text message
// @route   POST /api/messages
// @access  Private
exports.sendMessage = async (req, res, next) => {
    try {
        const { receiverId, content, category, priority, relatedTo, referenceId } = req.body;
        const senderId = req.user.id;

        // Trim IDs to remove any whitespace
        const trimmedReceiverId = receiverId.toString().trim();
        const trimmedSenderId = senderId.toString().trim();

        // Check if users exist
        const [sender, receiver] = await Promise.all([
            User.findById(trimmedSenderId),
            User.findById(trimmedReceiverId)
        ]);

        if (!sender || !receiver) {
            return res.status(404).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'User not found'
            });
        }

        // Check doctor-patient relationship if both are different roles
        if ((sender.role === 'doctor' && receiver.role === 'patient') ||
            (sender.role === 'patient' && receiver.role === 'doctor')) {

            const doctorId = sender.role === 'doctor' ? sender._id : receiver._id;
            const patientId = sender.role === 'patient' ? sender._id : receiver._id;

            // Check if there's at least one appointment between them
            const hasRelationship = await Appointment.findOne({
                doctorId,
                patientId,
                status: { $in: ['pending', 'confirmed', 'completed'] }
            });

            if (!hasRelationship) {
                return res.status(403).json({
                    success: false,
                    timestamp: getCurrentUTC(),
                    message: 'No doctor-patient relationship exists between these users'
                });
            }
        }

        // Find existing conversation or create a new one
        let conversation = await Conversation.findOne({
            participants: { $all: [trimmedSenderId, trimmedReceiverId] }
        });

        if (!conversation) {
            // Set doctor and patient IDs based on roles
            const doctorId = sender.role === 'doctor' ? sender._id :
                (receiver.role === 'doctor' ? receiver._id : null);
            const patientId = sender.role === 'patient' ? sender._id :
                (receiver.role === 'patient' ? receiver._id : null);

            conversation = await Conversation.create({
                participants: [trimmedSenderId, trimmedReceiverId],
                metadata: {
                    doctorId,
                    patientId,
                    unreadCount: new Map([[trimmedReceiverId, 1]])
                }
            });
        } else {
            // Update unread count for receiver
            const unreadCount = conversation.metadata.unreadCount || new Map();
            const currentCount = unreadCount.get(trimmedReceiverId) || 0;
            unreadCount.set(trimmedReceiverId, currentCount + 1);
            conversation.metadata.unreadCount = unreadCount;
        }

        // Create a new message
        const newMessage = new Message({
            conversationId: conversation._id,
            senderId: trimmedSenderId,
            receiverId: trimmedReceiverId,
            messageType: 'text',
            content,
            metadata: {
                category: category || 'general',
                priority: priority || 'normal',
                relatedTo: relatedTo || 'none',
                referenceId: referenceId || null,
                isUrgent: priority === 'urgent'
            },
            createdAt: getCurrentUTC()
        });

        // Update conversation with last message
        conversation.lastMessage = newMessage._id;
        conversation.updatedAt = getCurrentUTC();

        // Save both documents
        await Promise.all([newMessage.save(), conversation.save()]);

        // Safely emit socket event for real-time update
        try {
            const socketService = require('../services/socketService');
            if (socketService.io) {
                socketService.io.to(trimmedReceiverId).emit('newMessage', {
                    message: newMessage,
                    conversation: conversation._id
                });
            }
        } catch (socketError) {
            logger.error(`Socket emission error: ${socketError.message}`);
            // This won't block the API response if socket fails
        }

        res.status(201).json({
            success: true,
            timestamp: getCurrentUTC(),
            data: newMessage
        });
    } catch (error) {
        logger.error(`Error in sendMessage: ${error.message}`);
        next(error);
    }
};

// @desc    Send a file message (image or document)
// @route   POST /api/messages/file
// @access  Private
exports.sendFileMessage = async (req, res, next) => {
    try {
        const { receiverId, category, priority, relatedTo, referenceId } = req.body;
        const senderId = req.user.id;

        // Trim IDs to remove any whitespace
        const trimmedReceiverId = receiverId.toString().trim();
        const trimmedSenderId = senderId.toString().trim();

        // Check if file was uploaded
        if (!req.file) {
            return res.status(400).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'No file uploaded'
            });
        }

        // Determine message type from mimetype
        const isImage = req.file.mimetype.startsWith('image/');
        const messageType = isImage ? 'image' : 'document';

        // Find or create conversation (same as in sendMessage)
        let conversation = await Conversation.findOne({
            participants: { $all: [trimmedSenderId, trimmedReceiverId] }
        });

        if (!conversation) {
            // Get user details for proper metadata
            const [sender, receiver] = await Promise.all([
                User.findById(trimmedSenderId),
                User.findById(trimmedReceiverId)
            ]);

            if (!sender || !receiver) {
                return res.status(404).json({
                    success: false,
                    timestamp: getCurrentUTC(),
                    message: 'User not found'
                });
            }

            const doctorId = sender.role === 'doctor' ? sender._id :
                (receiver.role === 'doctor' ? receiver._id : null);
            const patientId = sender.role === 'patient' ? sender._id :
                (receiver.role === 'patient' ? receiver._id : null);

            conversation = await Conversation.create({
                participants: [trimmedSenderId, trimmedReceiverId],
                metadata: {
                    doctorId,
                    patientId,
                    unreadCount: new Map([[trimmedReceiverId, 1]])
                }
            });
        } else {
            // Update unread count for receiver
            const unreadCount = conversation.metadata.unreadCount || new Map();
            const currentCount = unreadCount.get(trimmedReceiverId) || 0;
            unreadCount.set(trimmedReceiverId, currentCount + 1);
            conversation.metadata.unreadCount = unreadCount;
        }

        // Create file URL
        const fileUrl = `${process.env.BASE_URL}/uploads/messages/${req.file.filename}`;

        // Create a new message
        const newMessage = new Message({
            conversationId: conversation._id,
            senderId: trimmedSenderId,
            receiverId: trimmedReceiverId,
            messageType,
            file: {
                url: fileUrl,
                filename: req.file.filename,
                contentType: req.file.mimetype,
                fileSize: req.file.size
            },
            metadata: {
                category: category || 'general',
                priority: priority || 'normal',
                relatedTo: relatedTo || 'none',
                referenceId: referenceId || null,
                isUrgent: priority === 'urgent'
            },
            createdAt: getCurrentUTC()
        });

        // Update conversation
        conversation.lastMessage = newMessage._id;
        conversation.updatedAt = getCurrentUTC();

        await Promise.all([newMessage.save(), conversation.save()]);

        // Safely emit socket event
        try {
            const socketService = require('../services/socketService');
            if (socketService.io) {
                socketService.io.to(trimmedReceiverId).emit('newMessage', {
                    message: newMessage,
                    conversation: conversation._id
                });
            }
        } catch (socketError) {
            logger.error(`Socket emission error: ${socketError.message}`);
            // This won't block the API response if socket fails
        }

        res.status(201).json({
            success: true,
            timestamp: getCurrentUTC(),
            data: newMessage
        });
    } catch (error) {
        logger.error(`Error in sendFileMessage: ${error.message}`);
        next(error);
    }
};

// @desc    Edit a message
// @route   PUT /api/messages/:messageId
// @access  Private
exports.editMessage = async (req, res, next) => {
    try {
        const { messageId } = req.params;
        const { content } = req.body;
        const userId = req.user.id;

        const message = await Message.findById(messageId);

        if (!message) {
            return res.status(404).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Message not found'
            });
        }

        // Check if user is the sender
        if (message.senderId.toString() !== userId) {
            return res.status(403).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Not authorized to edit this message'
            });
        }

        // Check if message type is text
        if (message.messageType !== 'text') {
            return res.status(400).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Only text messages can be edited'
            });
        }

        // Check if message is deleted
        if (message.deletedFor.includes(userId)) {
            return res.status(400).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Cannot edit a deleted message'
            });
        }

        // Add current content to history
        message.editHistory.push({
            content: message.content,
            editedAt: getCurrentUTC()
        });

        // Update content
        message.content = content;
        message.isEdited = true;
        await message.save();

        // Emit socket event
        try {
            const socketService = require('../services/socketService');
            if (socketService.io) {
                socketService.io.to(message.receiverId.toString()).emit('messageEdited', {
                    messageId,
                    content,
                    editedAt: getCurrentUTC()
                });
            }
        } catch (socketError) {
            logger.error(`Socket emission error: ${socketError.message}`);
        }

        res.status(200).json({
            success: true,
            timestamp: getCurrentUTC(),
            data: message
        });
    } catch (error) {
        logger.error(`Error in editMessage: ${error.message}`);
        next(error);
    }
};

// @desc    Add reaction to a message
// @route   POST /api/messages/:messageId/reactions
// @access  Private
exports.addReaction = async (req, res, next) => {
    try {
        const { messageId } = req.params;
        const { reaction } = req.body;
        const userId = req.user.id;

        // Validate reaction - limited set of acceptable emojis
        const validReactions = ['👍', '❤️', '😂', '😮', '😢', '👏', '🔥'];
        if (!validReactions.includes(reaction)) {
            return res.status(400).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Invalid reaction. Please use one of the supported emojis.'
            });
        }

        const message = await Message.findById(messageId);

        if (!message) {
            return res.status(404).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Message not found'
            });
        }

        // Check if user is a participant
        if (message.senderId.toString() !== userId && message.receiverId.toString() !== userId) {
            return res.status(403).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Not authorized to react to this message'
            });
        }

        // Check if message is deleted for this user
        if (message.deletedFor.includes(userId)) {
            return res.status(400).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Cannot react to a deleted message'
            });
        }

        // Add reaction
        const reactions = message.reactions || new Map();
        
        // Initialize reaction array if it doesn't exist
        if (!reactions.has(reaction)) {
            reactions.set(reaction, []);
        }

        const users = reactions.get(reaction);
        
        // Check if user already reacted with this emoji
        const existingReactionIndex = users.findIndex(r => r.userId.toString() === userId);
        
        if (existingReactionIndex === -1) {
            // Add new reaction
            users.push({ 
                userId: userId,
                addedAt: getCurrentUTC() 
            });
        } else {
            // User already reacted with this emoji - do nothing
            return res.status(200).json({
                success: true,
                timestamp: getCurrentUTC(),
                data: message,
                message: 'Reaction already exists'
            });
        }

        // Save updated reactions
        message.reactions = reactions;
        await message.save();

        // Emit socket event
        try {
            const socketService = require('../services/socketService');
            if (socketService.io) {
                // Emit to both users
                const otherUserId = message.senderId.toString() === userId ? 
                    message.receiverId.toString() : message.senderId.toString();
                
                socketService.io.to(otherUserId).emit('messageReaction', {
                    messageId,
                    reaction,
                    userId,
                    added: true
                });
            }
        } catch (socketError) {
            logger.error(`Socket emission error: ${socketError.message}`);
        }

        res.status(200).json({
            success: true,
            timestamp: getCurrentUTC(),
            data: message
        });
    } catch (error) {
        logger.error(`Error in addReaction: ${error.message}`);
        next(error);
    }
};

// @desc    Remove reaction from a message
// @route   DELETE /api/messages/:messageId/reactions/:reaction
// @access  Private
exports.removeReaction = async (req, res, next) => {
    try {
        const { messageId, reaction } = req.params;
        const userId = req.user.id;

        const message = await Message.findById(messageId);

        if (!message) {
            return res.status(404).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Message not found'
            });
        }

        // Check if message is deleted for this user
        if (message.deletedFor.includes(userId)) {
            return res.status(400).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Cannot modify reactions on a deleted message'
            });
        }

        // Check if reaction exists
        const reactions = message.reactions || new Map();
        
        if (!reactions.has(reaction)) {
            return res.status(404).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Reaction not found'
            });
        }

        // Find user's reaction
        const users = reactions.get(reaction);
        const existingReactionIndex = users.findIndex(r => r.userId.toString() === userId);

        if (existingReactionIndex === -1) {
            return res.status(404).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'You have not reacted with this emoji'
            });
        }

        // Remove reaction
        users.splice(existingReactionIndex, 1);
        
        // If no users left for this reaction, remove the reaction entirely
        if (users.length === 0) {
            reactions.delete(reaction);
        }

        // Save updated message
        message.reactions = reactions;
        await message.save();

        // Emit socket event
        try {
            const socketService = require('../services/socketService');
            if (socketService.io) {
                // Emit to both users
                const otherUserId = message.senderId.toString() === userId ? 
                    message.receiverId.toString() : message.senderId.toString();
                
                socketService.io.to(otherUserId).emit('messageReaction', {
                    messageId,
                    reaction,
                    userId,
                    added: false
                });
            }
        } catch (socketError) {
            logger.error(`Socket emission error: ${socketError.message}`);
        }

        res.status(200).json({
            success: true,
            timestamp: getCurrentUTC(),
            data: message
        });
    } catch (error) {
        logger.error(`Error in removeReaction: ${error.message}`);
        next(error);
    }
};

// @desc    Forward a message
// @route   POST /api/messages/:messageId/forward
// @access  Private
exports.forwardMessage = async (req, res, next) => {
    try {
        const { messageId } = req.params;
        const { receiverId } = req.body;
        const senderId = req.user.id;

        // Trim IDs
        const trimmedReceiverId = receiverId.toString().trim();
        const trimmedSenderId = senderId.toString().trim();

        // Get original message
        const originalMessage = await Message.findById(messageId);

        if (!originalMessage) {
            return res.status(404).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Message not found'
            });
        }

        // Check if original message is deleted for this user
        if (originalMessage.deletedFor.includes(trimmedSenderId)) {
            return res.status(400).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Cannot forward a deleted message'
            });
        }

        // Check if sender has access to this message
        if (originalMessage.senderId.toString() !== trimmedSenderId && 
            originalMessage.receiverId.toString() !== trimmedSenderId) {
            return res.status(403).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Not authorized to forward this message'
            });
        }

        // Check if users exist
        const [sender, receiver] = await Promise.all([
            User.findById(trimmedSenderId),
            User.findById(trimmedReceiverId)
        ]);

        if (!sender || !receiver) {
            return res.status(404).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'User not found'
            });
        }

        // Get or create conversation
        let conversation = await Conversation.findOne({
            participants: { $all: [trimmedSenderId, trimmedReceiverId] }
        });

        if (!conversation) {
            const doctorId = sender.role === 'doctor' ? sender._id :
                (receiver.role === 'doctor' ? receiver._id : null);
            const patientId = sender.role === 'patient' ? sender._id :
                (receiver.role === 'patient' ? receiver._id : null);
            
            conversation = await Conversation.create({
                participants: [trimmedSenderId, trimmedReceiverId],
                metadata: {
                    doctorId,
                    patientId,
                    unreadCount: new Map([[trimmedReceiverId, 1]])
                }
            });
        } else {
            // Update unread count
            const unreadCount = conversation.metadata.unreadCount || new Map();
            const currentCount = unreadCount.get(trimmedReceiverId) || 0;
            unreadCount.set(trimmedReceiverId, currentCount + 1);
            conversation.metadata.unreadCount = unreadCount;
        }

        // Create forwarded message
        const newMessage = new Message({
            conversationId: conversation._id,
            senderId: trimmedSenderId,
            receiverId: trimmedReceiverId,
            messageType: originalMessage.messageType,
            content: originalMessage.content,
            file: originalMessage.file,
            forwardedFrom: {
                messageId: originalMessage._id,
                userId: originalMessage.senderId,
                conversationId: originalMessage.conversationId
            },
            metadata: {
                category: originalMessage.metadata.category,
                priority: originalMessage.metadata.priority,
                relatedTo: originalMessage.metadata.relatedTo,
                referenceId: originalMessage.metadata.referenceId,
                isUrgent: originalMessage.metadata.isUrgent
            },
            createdAt: getCurrentUTC()
        });

        // Update conversation
        conversation.lastMessage = newMessage._id;
        conversation.updatedAt = getCurrentUTC();

        // Save documents
        await Promise.all([newMessage.save(), conversation.save()]);

        // Emit socket event
        try {
            const socketService = require('../services/socketService');
            if (socketService.io) {
                socketService.io.to(trimmedReceiverId).emit('newMessage', {
                    message: newMessage,
                    conversation: conversation._id,
                    isForwarded: true
                });
            }
        } catch (socketError) {
            logger.error(`Socket emission error: ${socketError.message}`);
        }

        res.status(201).json({
            success: true,
            timestamp: getCurrentUTC(),
            data: newMessage
        });
    } catch (error) {
        logger.error(`Error in forwardMessage: ${error.message}`);
        next(error);
    }
};

// @desc    Search messages
// @route   GET /api/messages/search
// @access  Private
exports.searchMessages = async (req, res, next) => {
    try {
        const { query, conversationId } = req.query;
        const userId = req.user.id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        if (!query || query.trim().length < 2) {
            return res.status(400).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Search query must be at least 2 characters long'
            });
        }

        // Base search criteria
        let searchCriteria = {
            $or: [
                { senderId: userId },
                { receiverId: userId }
            ],
            deletedFor: { $ne: userId }
        };

        // Add content search (use $regex for more flexible searching)
        searchCriteria.content = { $regex: query, $options: 'i' };

        // If conversationId is provided, filter by conversation
        if (conversationId) {
            // Verify user has access to this conversation
            const hasAccess = await Conversation.findOne({
                _id: conversationId,
                participants: userId
            });

            if (!hasAccess) {
                return res.status(403).json({
                    success: false,
                    timestamp: getCurrentUTC(),
                    message: 'You do not have access to this conversation'
                });
            }

            searchCriteria.conversationId = conversationId;
        } else {
            // Find all conversations user is part of
            const conversations = await Conversation.find({
                participants: userId
            });
            
            if (conversations.length > 0) {
                searchCriteria.conversationId = {
                    $in: conversations.map(c => c._id)
                };
            }
        }

        // Perform the search
        const messages = await Message.find(searchCriteria)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate({
                path: 'conversationId',
                select: 'participants',
                populate: {
                    path: 'participants',
                    select: 'firstName lastName profilePicture role'
                }
            });

        // Get total count for pagination
        const total = await Message.countDocuments(searchCriteria);

        res.status(200).json({
            success: true,
            timestamp: getCurrentUTC(),
            data: {
                messages,
                pagination: {
                    total,
                    page,
                    limit,
                    pages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        logger.error(`Error in searchMessages: ${error.message}`);
        next(error);
    }
};

// @desc    Get messages from a conversation
// @route   GET /api/messages/:conversationId
// @access  Private
exports.getMessages = async (req, res, next) => {
    try {
        const { conversationId } = req.params;
        const userId = req.user.id;
        const { page = 1, limit = 20 } = req.query;

        // Validate that user is part of the conversation
        const conversation = await Conversation.findOne({
            _id: conversationId,
            participants: userId
        });

        if (!conversation) {
            return res.status(404).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Conversation not found or you do not have access'
            });
        }

        // Calculate pagination
        const skip = (page - 1) * limit;

        // Get messages
        const messages = await Message.find({
            conversationId,
            deletedFor: { $ne: userId }
        })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        // Get total count for pagination
        const total = await Message.countDocuments({
            conversationId,
            deletedFor: { $ne: userId }
        });

        // Reset unread count for this user
        if (conversation.metadata && conversation.metadata.unreadCount) {
            const unreadCount = conversation.metadata.unreadCount;
            unreadCount.set(userId.toString(), 0);
            conversation.metadata.unreadCount = unreadCount;
            await conversation.save();
        }

        res.status(200).json({
            success: true,
            timestamp: getCurrentUTC(),
            data: {
                messages: messages.reverse(), // Return in chronological order
                pagination: {
                    total,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    pages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        logger.error(`Error in getMessages: ${error.message}`);
        next(error);
    }
};

// @desc    Get user conversations
// @route   GET /api/messages/conversations
// @access  Private
exports.getConversations = async (req, res, next) => {
    try {
        const userId = req.user.id;

        // Get all conversations where user is a participant
        const conversations = await Conversation.find({
            participants: userId
        })
            .populate('participants', 'firstName lastName profilePicture role')
            .populate('lastMessage')
            .sort({ updatedAt: -1 });

        // Format data for client
        const formattedConversations = conversations.map(conversation => {
            // Find the other participant
            const otherParticipant = conversation.participants.find(
                p => p._id.toString() !== userId
            );

            // Get unread count for this user
            const unreadCount = conversation.metadata && conversation.metadata.unreadCount
                ? (conversation.metadata.unreadCount.get(userId.toString()) || 0)
                : 0;

            return {
                _id: conversation._id,
                participant: otherParticipant,
                lastMessage: conversation.lastMessage,
                unreadCount,
                updatedAt: conversation.updatedAt
            };
        });

        res.status(200).json({
            success: true,
            timestamp: getCurrentUTC(),
            data: formattedConversations
        });
    } catch (error) {
        logger.error(`Error in getConversations: ${error.message}`);
        next(error);
    }
};

// @desc    Mark message as read
// @route   PUT /api/messages/:messageId/read
// @access  Private
exports.markMessageAsRead = async (req, res, next) => {
    try {
        const { messageId } = req.params;
        const userId = req.user.id;

        const message = await Message.findById(messageId);

        if (!message) {
            return res.status(404).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Message not found'
            });
        }

        // Check if user is the receiver
        if (message.receiverId.toString() !== userId) {
            return res.status(403).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Not authorized to mark this message as read'
            });
        }

        // Update message status
        message.metadata.status = 'read';
        message.metadata.readAt = getCurrentUTC();

        // Get the conversation to update unread count
        const conversation = await Conversation.findById(message.conversationId);
        if (conversation && conversation.metadata && conversation.metadata.unreadCount) {
            // Reset unread count for this user
            const unreadCount = conversation.metadata.unreadCount;
            unreadCount.set(userId.toString(), 0);
            conversation.metadata.unreadCount = unreadCount;
            
            // Save both message and conversation
            await Promise.all([message.save(), conversation.save()]);
        } else {
            await message.save();
        }

        // Safely emit socket event
        try {
            const socketService = require('../services/socketService');
            if (socketService.io) {
                socketService.io.to(message.senderId.toString()).emit('messageRead', {
                    messageId,
                    readAt: message.metadata.readAt
                });
            }
        } catch (socketError) {
            logger.error(`Socket emission error: ${socketError.message}`);
        }

        res.status(200).json({
            success: true,
            timestamp: getCurrentUTC(),
            data: message
        });
    } catch (error) {
        logger.error(`Error in markMessageAsRead: ${error.message}`);
        next(error);
    }
};

// @desc    Get unread message count
// @route   GET /api/messages/unread/count
// @access  Private
exports.getUnreadCount = async (req, res, next) => {
    try {
        const userId = req.user.id;

        // Get all conversations with unread messages
        const conversations = await Conversation.find({
            participants: userId,
            'metadata.unreadCount': { $exists: true }
        });

        // Calculate total unread messages
        let totalUnread = 0;
        conversations.forEach(conversation => {
            if (conversation.metadata && conversation.metadata.unreadCount) {
                const userUnread = conversation.metadata.unreadCount.get(userId.toString()) || 0;
                totalUnread += userUnread;
            }
        });

        res.status(200).json({
            success: true,
            timestamp: getCurrentUTC(),
            data: {
                unreadCount: totalUnread
            }
        });
    } catch (error) {
        logger.error(`Error in getUnreadCount: ${error.message}`);
        next(error);
    }
};

// @desc    Delete message for user
// @route   DELETE /api/messages/:messageId
// @access  Private
exports.deleteMessage = async (req, res, next) => {
    try {
        const { messageId } = req.params;
        const userId = req.user.id;

        const message = await Message.findById(messageId);

        if (!message) {
            return res.status(404).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Message not found'
            });
        }

        // Check if user is a participant
        if (message.senderId.toString() !== userId && message.receiverId.toString() !== userId) {
            return res.status(403).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Not authorized to delete this message'
            });
        }

        // Add user to deletedFor array
        if (!message.deletedFor.includes(userId)) {
            message.deletedFor.push(userId);
            await message.save();
        }

        res.status(200).json({
            success: true,
            timestamp: getCurrentUTC(),
            message: 'Message deleted successfully'
        });
    } catch (error) {
        logger.error(`Error in deleteMessage: ${error.message}`);
        next(error);
    }
};