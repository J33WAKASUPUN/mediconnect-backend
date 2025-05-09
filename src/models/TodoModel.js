const mongoose = require('mongoose');
const { getCurrentUTC } = require('../utils/dateTime');

const todoSchema = new mongoose.Schema({
    doctorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    date: {
        type: Date,
        required: true
    },
    title: {
        type: String,
        required: [true, 'Todo title is required'],
        trim: true,
        maxlength: [100, 'Title cannot be more than 100 characters']
    },
    description: {
        type: String,
        trim: true,
        maxlength: [500, 'Description cannot be more than 500 characters']
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'medium'
    },
    completed: {
        type: Boolean,
        default: false
    },
    time: {
        type: String,
        match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Please enter valid time format HH:MM'],
        required: false
    },
    createdAt: {
        type: Date,
        default: () => getCurrentUTC()
    },
    updatedAt: {
        type: Date,
        default: () => getCurrentUTC()
    }
}, {
    timestamps: true
});

// Create compound index for efficient querying
todoSchema.index({ doctorId: 1, date: 1 });

module.exports = mongoose.model('Todo', todoSchema);