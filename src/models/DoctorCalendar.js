const mongoose = require('mongoose');
const { getCurrentUTC } = require('../utils/dateTime');

const timeSlotSchema = new mongoose.Schema({
    startTime: {
        type: String,
        required: [true, 'Start time is required'],
        match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Please enter valid time format HH:MM']
    },
    endTime: {
        type: String,
        required: [true, 'End time is required'],
        match: [/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Please enter valid time format HH:MM']
    },
    isBooked: {
        type: Boolean,
        default: false
    },
    isBlocked: {
        type: Boolean,
        default: false
    }
});

const dailyScheduleSchema = new mongoose.Schema({
    date: {
        type: Date,
        required: true
    },
    slots: [timeSlotSchema],
    isHoliday: {
        type: Boolean,
        default: false
    },
    holidayReason: {
        type: String,
        default: null
    }
});

const doctorCalendarSchema = new mongoose.Schema({
    doctorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    schedule: [dailyScheduleSchema],
    defaultWorkingHours: [{
        day: {
            type: String,
            enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
            required: true
        },
        isWorking: {
            type: Boolean,
            default: true
        },
        slots: [timeSlotSchema]
    }],
    lastUpdated: {
        type: Date,
        default: () => getCurrentUTC()
    }
}, {
    timestamps: true
});

// Indexes for efficient querying
doctorCalendarSchema.index({ doctorId: 1 });
doctorCalendarSchema.index({ 'schedule.date': 1 });

module.exports = mongoose.model('DoctorCalendar', doctorCalendarSchema);