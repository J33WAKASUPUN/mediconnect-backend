const mongoose = require('mongoose');
const { getCurrentUTC } = require('../utils/dateTime');

const healthMessageSchema = new mongoose.Schema({
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'HealthSession',
    required: true,
    index: true
  },
  role: {
    type: String,
    enum: ['user', 'assistant', 'system'],
    required: true
  },
  content: {
    type: String,
    required: true
  },
  tokenUsage: {
    prompt_tokens: Number,
    completion_tokens: Number,
    total_tokens: Number
  },
  createdAt: {
    type: Date,
    default: () => getCurrentUTC()
  }
});

module.exports = mongoose.model('HealthMessage', healthMessageSchema);