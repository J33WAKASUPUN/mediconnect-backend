const mongoose = require('mongoose');
const { getCurrentUTC } = require('../utils/dateTime');

const healthSessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  title: {
    type: String,
    default: 'New Health Conversation'
  },
  userType: {
    type: String,
    enum: ['patient', 'professional'],
    default: 'patient'
  },
  lastMessagePreview: {
    type: String,
    default: ''
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: () => getCurrentUTC()
  },
  updatedAt: {
    type: Date,
    default: () => getCurrentUTC()
  }
});

// Method to update title based on first message
healthSessionSchema.methods.updateTitleFromMessage = async function(messageContent) {
  if (this.title === 'New Health Conversation' && messageContent) {
    this.title = messageContent.substring(0, 50) + (messageContent.length > 50 ? '...' : '');
    this.updatedAt = getCurrentUTC();
    await this.save();
  }
};

// Method to update the last message preview
healthSessionSchema.methods.updateLastMessage = async function(messageContent) {
  this.lastMessagePreview = messageContent.substring(0, 100) + (messageContent.length > 100 ? '...' : '');
  this.updatedAt = getCurrentUTC();
  await this.save();
};

module.exports = mongoose.model('HealthSession', healthSessionSchema);