const mongoose = require('mongoose');
const { getCurrentUTC } = require('../utils/dateTime');

const messageSchema = new mongoose.Schema({
    conversationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Conversation',
        required: true
    },
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    receiverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    messageType: {
        type: String,
        enum: ['text', 'image', 'document', 'system'],
        default: 'text'
    },
    content: {
        type: String,
        required: function() { 
            return this.messageType === 'text' || this.messageType === 'system'; 
        }
    },
    file: {
        url: {
            type: String,
            required: function() { 
                return this.messageType === 'image' || this.messageType === 'document'; 
            }
        },
        filename: String,
        contentType: String,
        fileSize: Number
    },
    // New fields for editing messages
    editHistory: [{
        content: String,
        editedAt: {
            type: Date,
            default: getCurrentUTC
        }
    }],
    isEdited: {
        type: Boolean,
        default: false
    },
    // New field for reactions
    reactions: {
        type: Map,
        of: [{
            userId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            addedAt: {
                type: Date,
                default: getCurrentUTC
            }
        }],
        default: () => new Map()
    },
    // New field for forwarded messages
    forwardedFrom: {
        messageId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Message'
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        conversationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Conversation'
        }
    },
    metadata: {
        status: {
            type: String,
            enum: ['sent', 'delivered', 'read'],
            default: 'sent'
        },
        deliveredAt: Date,
        readAt: Date,
        category: {
            type: String,
            enum: ['general', 'medical', 'administrative', 'follow_up'],
            default: 'general'
        },
        priority: {
            type: String,
            enum: ['normal', 'urgent'],
            default: 'normal'
        },
        relatedTo: {
            type: String,
            enum: ['none', 'appointment', 'medical_record'],
            default: 'none'
        },
        referenceId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null
        },
        isUrgent: {
            type: Boolean,
            default: false
        }
    },
    deletedFor: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    createdAt: {
        type: Date,
        default: getCurrentUTC
    }
});

// Index for efficient queries
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ senderId: 1, receiverId: 1 });
// New text index for search functionality
messageSchema.index({ content: 'text' });

module.exports = mongoose.model('Message', messageSchema);