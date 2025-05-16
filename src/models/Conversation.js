const mongoose = require('mongoose');
const { getCurrentUTC } = require('../utils/dateTime');

const conversationSchema = new mongoose.Schema({
    participants: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }],
    lastMessage: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message'
    },
    metadata: {
        appointmentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Appointment',
            default: null
        },
        unreadCount: {
            type: Map,
            of: Number,
            default: new Map()
        },
        status: {
            type: String,
            enum: ['active', 'archived'],
            default: 'active'
        },
        doctorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        patientId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    },
    createdAt: {
        type: Date,
        default: getCurrentUTC
    },
    updatedAt: {
        type: Date,
        default: getCurrentUTC
    }
});

// Virtual field for message count
conversationSchema.virtual('messageCount', {
    ref: 'Message',
    localField: '_id',
    foreignField: 'conversationId',
    count: true
});

// Middleware to update updatedAt on save
conversationSchema.pre('save', function(next) {
    this.updatedAt = getCurrentUTC();
    next();
});

// Index for efficient queries
conversationSchema.index({ participants: 1 });
conversationSchema.index({ 'metadata.doctorId': 1, 'metadata.patientId': 1 });

module.exports = mongoose.model('Conversation', conversationSchema);