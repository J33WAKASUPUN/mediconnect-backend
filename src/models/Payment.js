const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    appointmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Appointment',
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        default: 'RS.'
    },
    status: {
        type: String,
        enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED', 'REFUND_FAILED'],
        default: 'PENDING'
    },
    paypalOrderId: {
        type: String
    },
    payerId: {
        type: String
    },
    transactionDetails: {
        captureId: String,
        paymentMethod: String,
        processorResponse: {
            code: String,
            message: String
        },
        merchantId: String,
        paymentTimestamp: Date
    },
    metadata: {
        ipAddress: String,
        userAgent: String,
        requestId: String,
        attemptCount: {
            type: Number,
            default: 0
        }
    },
    refundDetails: {
        refundId: String,
        reason: String,
        refundedAt: Date,
        status: {
            type: String,
            enum: ['COMPLETED', 'FAILED', 'PENDING']
        },
        amount: Number,
        processorResponse: {
            code: String,
            message: String
        }
    }
}, {
    timestamps: true
});

// Indexes for efficient querying
paymentSchema.index({ appointmentId: 1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ 'refundDetails.status': 1 });
paymentSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Payment', paymentSchema);