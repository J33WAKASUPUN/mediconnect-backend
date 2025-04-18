const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
    patientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    doctorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    dateTime: {
        type: Date,
        required: [true, 'Appointment date and time is required']
    },
    duration: {
        type: Number,
        required: [true, 'Duration in minutes is required'],
        default: 30
    },
    // Single consolidated status field
    status: {
        type: String,
        enum: [
            'pending_payment',  
            'pending', 
            'confirmed', 
            'cancelled', 
            'completed', 
            'no_show', 
            'rescheduled'
        ],
        default: 'pending_payment' 
    },
    reasonForVisit: {
        type: String,
        required: [true, 'Reason for visit is required']
    },
    cancellationReason: {
        type: String,
        default: null
    },
    cancelledBy: {
        type: String,
        enum: ['patient', 'doctor', null],
        default: null
    },
    rescheduledFrom: {
        type: Date,
        default: null
    },
    rating: {
        score: {
            type: Number,
            min: 1,
            max: 5,
            default: null
        },
        feedback: {
            type: String,
            default: null
        },
        isAnonymous: {
            type: Boolean,
            default: false
        }
    }
}, {
    timestamps: true
});

// Add indexes for common queries
appointmentSchema.index({ patientId: 1, status: 1 });
appointmentSchema.index({ doctorId: 1, status: 1 });
appointmentSchema.index({ dateTime: 1 });

module.exports = mongoose.model('Appointment', appointmentSchema);