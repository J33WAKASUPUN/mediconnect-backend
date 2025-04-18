const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
    appointmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Appointment',
        required: true
    },
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
    rating: {
        type: Number,
        required: [true, 'Please provide a rating'],
        min: 1,
        max: 5
    },
    review: {
        type: String,
        required: [true, 'Please provide a review'],
        trim: true,
        maxlength: [500, 'Review cannot be more than 500 characters']
    },
    isAnonymous: {
        type: Boolean,
        default: false
    },
    doctorResponse: {
        content: {
            type: String,
            trim: true,
            maxlength: [500, 'Response cannot be more than 500 characters']
        },
        respondedAt: {
            type: Date
        }
    }
}, {
    timestamps: true
});

// Indexes for efficient querying
reviewSchema.index({ doctorId: 1, createdAt: -1 });
reviewSchema.index({ patientId: 1, createdAt: -1 });
reviewSchema.index({ appointmentId: 1 }, { unique: true }); // Keep only this definition

module.exports = mongoose.model('Review', reviewSchema);