const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const Appointment = require('../models/Appointment');
const { getCurrentUTC } = require('../utils/dateTime');
const logger = require('../utils/logger');
const { io } = require('../services/socketService');
const fs = require('fs');

// @desc    Send a text message
// @route   POST /api/messages
// @access  Private
exports.sendMessage = async (req, res, next) => {
    try {
        const { receiverId, content, category, priority, relatedTo, referenceId } = req.body;
        const senderId = req.user.id;

        // Check if users exist
        const [sender, receiver] = await Promise.all([
            User.findById(senderId),
            User.findById(receiverId)
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
            participants: { $all: [senderId, receiverId] }
        });

        if (!conversation) {
            // Set doctor and patient IDs based on roles
            const doctorId = sender.role === 'doctor' ? sender._id : 
                            (receiver.role === 'doctor' ? receiver._id : null);
            const patientId = sender.role === 'patient' ? sender._id : 
                             (receiver.role === 'patient' ? receiver._id : null);
            
            conversation = await Conversation.create({
                participants: [senderId, receiverId],
                metadata: {
                    doctorId,
                    patientId,
                    unreadCount: new Map([[receiverId.toString(), 1]])
                }
            });
        } else {
            // Update unread count for receiver
            const unreadCount = conversation.metadata.unreadCount || new Map();
            const currentCount = unreadCount.get(receiverId.toString()) || 0;
            unreadCount.set(receiverId.toString(), currentCount + 1);
            conversation.metadata.unreadCount = unreadCount;
        }

        // Create a new message
        const newMessage = new Message({
            conversationId: conversation._id,
            senderId,
            receiverId,
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

        // Emit socket event for real-time update
        io.to(receiverId.toString()).emit('newMessage', {
            message: newMessage,
            conversation: conversation._id
        });

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
            participants: { $all: [senderId, receiverId] }
        });

        if (!conversation) {
            // Get user details for proper metadata
            const [sender, receiver] = await Promise.all([
                User.findById(senderId),
                User.findById(receiverId)
            ]);

            const doctorId = sender.role === 'doctor' ? sender._id : 
                            (receiver.role === 'doctor' ? receiver._id : null);
            const patientId = sender.role === 'patient' ? sender._id : 
                             (receiver.role === 'patient' ? receiver._id : null);
            
            conversation = await Conversation.create({
                participants: [senderId, receiverId],
                metadata: {
                    doctorId,
                    patientId,
                    unreadCount: new Map([[receiverId.toString(), 1]])
                }
            });
        } else {
            // Update unread count for receiver
            const unreadCount = conversation.metadata.unreadCount || new Map();
            const currentCount = unreadCount.get(receiverId.toString()) || 0;
            unreadCount.set(receiverId.toString(), currentCount + 1);
            conversation.metadata.unreadCount = unreadCount;
        }

        // Create file URL
        const fileUrl = `${process.env.BASE_URL}/uploads/messages/${req.file.filename}`;

        // Create a new message
        const newMessage = new Message({
            conversationId: conversation._id,
            senderId,
            receiverId,
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

        // Emit socket event
        io.to(receiverId.toString()).emit('newMessage', {
            message: newMessage,
            conversation: conversation._id
        });

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
        await message.save();

        // Emit socket event
        io.to(message.senderId.toString()).emit('messageRead', {
            messageId,
            readAt: message.metadata.readAt
        });

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