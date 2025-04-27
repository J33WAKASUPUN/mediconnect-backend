const PayPal = require('@paypal/checkout-server-sdk');
const { client } = require('../config/paypal');
const Payment = require('../models/Payment');
const Appointment = require('../models/Appointment');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { getCurrentUTC } = require('../utils/dateTime');
const { generatePaymentReceiptPDF } = require('../utils/generateReceiptPDF');
const jwt = require('jsonwebtoken');

class PaymentService {
    async createPaymentOrder(appointmentId, amount, metadata = {}) {
        try {
            const appointment = await Appointment.findById(appointmentId)
                .populate('doctorId', 'firstName lastName consultationFees')
                .populate('patientId', 'firstName lastName');

            if (!appointment) {
                logger.error(`Appointment not found: ${appointmentId} at ${getCurrentUTC()}`);
                throw new Error('Appointment not found');
            }

            // Allow both pending_payment and pending statuses
            const allowedStatuses = ['pending_payment', 'pending'];
            if (!allowedStatuses.includes(appointment.status)) {
                logger.error(`Invalid appointment status for payment: ${appointment.status} at ${getCurrentUTC()}`);
                return {
                    success: false,
                    error: 'Appointment must be in pending_payment or pending status to process payment',
                    timestamp: getCurrentUTC()
                };
            }

            // Create PayPal order
            const request = new PayPal.orders.OrdersCreateRequest();
            request.prefer("return=representation");
            request.requestBody({
                intent: 'CAPTURE',
                purchase_units: [{
                    amount: {
                        currency_code: 'USD',
                        value: amount.toString()
                    },
                    description: `Appointment with Dr. ${appointment.doctorId.lastName} on ${new Date(appointment.dateTime).toISOString().split('T')[0]}`
                }]
            });

            // Call PayPal to create the order
            const order = await client.execute(request);

            // Create payment record
            const payment = await Payment.create({
                appointmentId,
                amount,
                paypalOrderId: order.result.id,
                status: 'PENDING',
                metadata: {
                    ...metadata,
                    requestId: order.result.id,
                    attemptCount: 1,
                    ipAddress: metadata.ipAddress || '',
                    userAgent: metadata.userAgent || ''
                }
            });

            // Update appointment status to pending after payment is initiated
            appointment.status = 'pending';
            await appointment.save();

            logger.info(`Payment order created: ${payment._id} at ${getCurrentUTC()}`);

            return {
                success: true,
                data: {
                    paymentId: payment._id,
                    orderId: order.result.id,
                    status: order.result.status,
                    links: order.result.links
                }
            };
        } catch (error) {
            logger.error(`Payment order creation failed: ${error.message} at ${getCurrentUTC()}`);
            return {
                success: false,
                error: error.message || 'Payment order creation failed',
                timestamp: getCurrentUTC()
            };
        }
    }

    async capturePayment(orderId) {
        try {
            // Validate order ID
            if (!orderId) {
                throw new Error('Order ID is required');
            }

            logger.info(`Attempting to capture payment for order: ${orderId} at ${getCurrentUTC()}`);

            // Find the payment record
            const payment = await Payment.findOne({ paypalOrderId: orderId });
            if (!payment) {
                logger.error(`Payment record not found for order: ${orderId}`);
                throw new Error('Payment record not found');
            }

            try {
                // Create capture request
                const request = new PayPal.orders.OrdersCaptureRequest(orderId);
                request.prefer("return=representation");
                request.requestBody({}); // Empty request body for capture

                // Execute the capture request
                const capture = await client.execute(request);

                if (capture.result.status === 'COMPLETED') {
                    // Update payment record
                    payment.status = 'COMPLETED';
                    payment.transactionDetails = {
                        captureId: capture.result.purchase_units[0].payments.captures[0].id,
                        paymentMethod: 'PayPal',
                        captureStatus: capture.result.status,
                        captureTime: getCurrentUTC(),
                        paypalResponse: capture.result
                    };
                    await payment.save();

                    // Update appointment status
                    const appointment = await Appointment.findById(payment.appointmentId);
                    if (appointment) {
                        appointment.status = 'pending';
                        await appointment.save();
                    }

                    logger.info(`Payment captured successfully: ${orderId}`);

                    return {
                        success: true,
                        data: {
                            paymentId: payment._id,
                            status: 'COMPLETED',
                            captureId: capture.result.purchase_units[0].payments.captures[0].id,
                            amount: capture.result.purchase_units[0].payments.captures[0].amount
                        }
                    };
                } else {
                    throw new Error(`Capture failed with status: ${capture.result.status}`);
                }
            } catch (paypalError) {
                logger.error(`PayPal capture error: ${paypalError.message}`);
                throw new Error(`PayPal capture failed: ${paypalError.message}`);
            }
        } catch (error) {
            logger.error(`Payment capture failed: ${error.message} at ${getCurrentUTC()}`);
            return {
                success: false,
                error: error.message || 'Payment capture failed',
                details: error.details || []
            };
        }
    }

    async getPaymentDetails(paymentId) {
        try {
            const payment = await Payment.findById(paymentId)
                .populate('appointmentId')
                .populate({
                    path: 'appointmentId',
                    populate: [
                        { path: 'doctorId', select: 'firstName lastName' },
                        { path: 'patientId', select: 'firstName lastName' }
                    ]
                });

            if (!payment) {
                throw new AppError('Payment not found', 404);
            }

            return {
                success: true,
                data: payment
            };
        } catch (error) {
            logger.error(`Get payment details failed: ${error.message} at ${getCurrentUTC()}`);
            throw new AppError(error.message, error.statusCode || 500);
        }
    }

    async getPaymentHistory({ userId, role, startDate, endDate, status, page, limit }) {
        try {
            let query = {};

            // Build date range query
            if (startDate || endDate) {
                query.createdAt = {};
                if (startDate) query.createdAt.$gte = new Date(startDate);
                if (endDate) query.createdAt.$lte = new Date(endDate);
            }

            // Add status filter if provided
            if (status) {
                query.status = status;
            }

            // Add role-based filters
            if (role === 'patient') {
                const appointments = await Appointment.find({ patientId: userId }).select('_id');
                query.appointmentId = { $in: appointments };
            } else if (role === 'doctor') {
                const appointments = await Appointment.find({ doctorId: userId }).select('_id');
                query.appointmentId = { $in: appointments };
            }

            // Execute query with pagination
            const skip = (page - 1) * limit;
            const payments = await Payment.find(query)
                .populate({
                    path: 'appointmentId',
                    populate: [
                        { path: 'doctorId', select: 'firstName lastName' },
                        { path: 'patientId', select: 'firstName lastName' }
                    ]
                })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit);

            const total = await Payment.countDocuments(query);

            return {
                payments,
                pagination: {
                    current: page,
                    total: Math.ceil(total / limit),
                    totalRecords: total
                }
            };
        } catch (error) {
            logger.error(`Failed to get payment history: ${error.message} at ${getCurrentUTC()}`);
            throw new AppError('Failed to retrieve payment history', 500);
        }
    }

    async getPaymentAnalytics({ userId, role, startDate, endDate }) {
        try {
            let appointmentQuery = {};
            if (role === 'patient') {
                appointmentQuery = { patientId: new mongoose.Types.ObjectId(userId) };
            } else if (role === 'doctor') {
                appointmentQuery = { doctorId: new mongoose.Types.ObjectId(userId) };
            }

            const appointments = await Appointment.find(appointmentQuery).select('_id');
            const appointmentIds = appointments.map(apt => apt._id);

            const dateQuery = {};
            if (startDate || endDate) {
                dateQuery.createdAt = {};
                if (startDate) dateQuery.createdAt.$gte = new Date(startDate);
                if (endDate) dateQuery.createdAt.$lte = new Date(endDate);
            }

            // Overall payment statistics
            const overallStats = await Payment.aggregate([
                {
                    $match: {
                        appointmentId: { $in: appointmentIds },
                        ...dateQuery
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalAmount: { $sum: '$amount' },
                        totalPayments: { $sum: 1 },
                        successfulPayments: {
                            $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] }
                        },
                        failedPayments: {
                            $sum: { $cond: [{ $eq: ['$status', 'FAILED'] }, 1, 0] }
                        },
                        refundedAmount: {
                            $sum: {
                                $cond: [
                                    { $eq: ['$status', 'REFUNDED'] },
                                    '$refundDetails.amount',
                                    0
                                ]
                            }
                        }
                    }
                }
            ]);

            // Monthly trends
            const monthlyTrends = await Payment.aggregate([
                {
                    $match: {
                        appointmentId: { $in: appointmentIds },
                        ...dateQuery
                    }
                },
                {
                    $group: {
                        _id: {
                            year: { $year: '$createdAt' },
                            month: { $month: '$createdAt' }
                        },
                        totalAmount: { $sum: '$amount' },
                        totalPayments: { $sum: 1 },
                        successfulPayments: {
                            $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] }
                        },
                        refundedAmount: {
                            $sum: {
                                $cond: [
                                    { $eq: ['$status', 'REFUNDED'] },
                                    '$refundDetails.amount',
                                    0
                                ]
                            }
                        }
                    }
                },
                { $sort: { '_id.year': -1, '_id.month': -1 } }
            ]);

            // Payment method distribution
            const paymentMethods = await Payment.aggregate([
                {
                    $match: {
                        appointmentId: { $in: appointmentIds },
                        status: 'COMPLETED',
                        ...dateQuery
                    }
                },
                {
                    $group: {
                        _id: '$transactionDetails.paymentMethod',
                        count: { $sum: 1 },
                        totalAmount: { $sum: '$amount' }
                    }
                }
            ]);

            return {
                overall: overallStats[0] || {
                    totalAmount: 0,
                    totalPayments: 0,
                    successfulPayments: 0,
                    failedPayments: 0,
                    refundedAmount: 0
                },
                monthlyTrends,
                paymentMethods,
                lastUpdated: getCurrentUTC()
            };
        } catch (error) {
            logger.error(`Failed to get payment analytics: ${error.message} at ${getCurrentUTC()}`);
            throw new AppError('Failed to retrieve payment analytics', 500);
        }
    }

    async getRefundHistory({ userId, role, startDate, endDate, status, page, limit }) {
        try {
            let query = { status: 'REFUNDED' };

            if (startDate || endDate) {
                query['refundDetails.refundedAt'] = {};
                if (startDate) query['refundDetails.refundedAt'].$gte = new Date(startDate);
                if (endDate) query['refundDetails.refundedAt'].$lte = new Date(endDate);
            }

            if (status) {
                query['refundDetails.status'] = status;
            }

            // Add role-based filters
            if (role === 'patient') {
                const appointments = await Appointment.find({ patientId: userId }).select('_id');
                query.appointmentId = { $in: appointments };
            } else if (role === 'doctor') {
                const appointments = await Appointment.find({ doctorId: userId }).select('_id');
                query.appointmentId = { $in: appointments };
            }

            const skip = (page - 1) * limit;
            const refunds = await Payment.find(query)
                .populate({
                    path: 'appointmentId',
                    populate: [
                        { path: 'doctorId', select: 'firstName lastName' },
                        { path: 'patientId', select: 'firstName lastName' }
                    ]
                })
                .sort({ 'refundDetails.refundedAt': -1 })
                .skip(skip)
                .limit(limit);

            const total = await Payment.countDocuments(query);

            return {
                refunds,
                pagination: {
                    current: page,
                    total: Math.ceil(total / limit),
                    totalRecords: total
                }
            };
        } catch (error) {
            logger.error(`Failed to get refund history: ${error.message} at ${getCurrentUTC()}`);
            throw new AppError('Failed to retrieve refund history', 500);
        }
    }

    async getPendingPayments(userId, role) {
        try {
            let query = { status: 'PENDING' };

            // Add role-based filters
            if (role === 'patient') {
                const appointments = await Appointment.find({ patientId: userId }).select('_id');
                query.appointmentId = { $in: appointments };
            } else if (role === 'doctor') {
                const appointments = await Appointment.find({ doctorId: userId }).select('_id');
                query.appointmentId = { $in: appointments };
            }

            const pendingPayments = await Payment.find(query)
                .populate({
                    path: 'appointmentId',
                    populate: [
                        { path: 'doctorId', select: 'firstName lastName' },
                        { path: 'patientId', select: 'firstName lastName' }
                    ]
                })
                .sort({ createdAt: -1 });

            return pendingPayments;
        } catch (error) {
            logger.error(`Failed to get pending payments: ${error.message} at ${getCurrentUTC()}`);
            throw new AppError('Failed to retrieve pending payments', 500);
        }
    }

    async generateReceipt(paymentId, currentUser) {
        try {
            const payment = await Payment.findById(paymentId)
                .populate({
                    path: 'appointmentId',
                    populate: [
                        {
                            path: 'doctorId',
                            select: 'firstName lastName email'
                        },
                        {
                            path: 'patientId',
                            select: 'firstName lastName email'
                        }
                    ]
                });

            if (!payment) {
                logger.error(`Receipt generation failed: Payment ${paymentId} not found at ${getCurrentUTC()}`);
                return {
                    success: false,
                    error: 'Payment not found'
                };
            }

            // Generate the PDF receipt
            const pdfPath = await generatePaymentReceiptPDF(payment, currentUser);

            logger.info(`Receipt generated successfully for payment: ${paymentId} at ${getCurrentUTC()}`);

            // You could also send an email with the receipt attached
            // This is optional but recommended for a better user experience
            try {
                // We're not sending the PDF as an attachment here, but just a notification
                // You could enhance this to include the PDF as an attachment
                await EmailService.sendPaymentNotification(
                    payment,
                    'payment_success', // You might want a specific 'receipt_generated' template
                    payment.appointmentId.patientId
                );

                logger.info(`Receipt notification email sent for payment: ${paymentId} at ${getCurrentUTC()}`);
            } catch (emailError) {
                logger.error(`Failed to send receipt notification email: ${emailError.message} at ${getCurrentUTC()}`);
                // Continue even if email fails
            }

            return {
                success: true,
                data: {
                    pdfPath,
                    payment: {
                        id: payment._id,
                        amount: payment.amount,
                        status: payment.status,
                        date: payment.createdAt
                    }
                }
            };

        } catch (error) {
            logger.error(`Receipt generation error: ${error.message} at ${getCurrentUTC()}`);
            return {
                success: false,
                error: 'Failed to generate receipt',
                details: error.message
            };
        }
    }
    async generateReceiptToken(paymentId) {
        try {
            // First verify that the payment exists
            const payment = await Payment.findById(paymentId);
            if (!payment) {
                return {
                    success: false,
                    error: 'Payment not found'
                };
            }

            // Generate a short-lived token specifically for this receipt
            const receiptToken = jwt.sign(
                { purpose: 'receipt_access', paymentId: paymentId },
                process.env.JWT_SECRET,
                { expiresIn: '10m' } // Token expires in 10 minutes
            );

            return {
                success: true,
                data: {
                    receiptToken,
                    expiresIn: '10 minutes'
                }
            };

        } catch (error) {
            logger.error(`Failed to generate receipt token: ${error.message}`);
            return {
                success: false,
                error: 'Failed to generate receipt token'
            };
        }
    }

}


module.exports = new PaymentService();