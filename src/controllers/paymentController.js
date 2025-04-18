const PaymentService = require('../services/paymentService');
const Payment = require('../models/Payment');
const WebhookService = require('../services/webhookService');
const EmailService = require('../services/emailService');
const catchAsync = require('../utils/catchAsync');
const { getCurrentUTC } = require('../utils/dateTime');
const logger = require('../utils/logger');


exports.createPaymentOrder = catchAsync(async (req, res) => {
    const { appointmentId, amount } = req.body;
    
    const metadata = {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        requestId: req.headers['x-request-id']
    };

    const order = await PaymentService.createPaymentOrder(appointmentId, amount, metadata);
    
    res.status(200).json({
        status: 'success',
        timestamp: getCurrentUTC(),
        data: order
    });
});

exports.capturePayment = catchAsync(async (req, res) => {
    const { orderId } = req.params;
    
    logger.info(`Received capture request for order: ${orderId} at ${getCurrentUTC()}`);

    const result = await PaymentService.capturePayment(orderId);
    
    if (!result.success) {
        logger.error(`Payment capture failed: ${result.error}`);
        return res.status(400).json({
            status: 'error',
            timestamp: getCurrentUTC(),
            message: result.error,
            details: result.details
        });
    }

    // Send payment success notification
    if (result.data.paymentId) {
        try {           
            // Directly fetch the fully populated payment with all required fields
            const payment = await Payment.findById(result.data.paymentId)
                .populate({
                    path: 'appointmentId',
                    populate: [
                        { path: 'patientId', select: 'firstName lastName email' },
                        { path: 'doctorId', select: 'firstName lastName email' }
                    ]
                });
            
            if (payment && payment.appointmentId && payment.appointmentId.patientId && payment.appointmentId.patientId.email) {
                console.log(`Sending payment success email to ${payment.appointmentId.patientId.email}`);
                
                await EmailService.sendPaymentNotification(
                    payment,
                    'payment_success',
                    payment.appointmentId.patientId
                );
                
                logger.info(`Payment success email sent to ${payment.appointmentId.patientId.email}`);
            } else {
                logger.error(`Could not find properly populated payment data for email notification: ${result.data.paymentId}`);
            }
        } catch (emailError) {
            logger.error(`Failed to send payment success email: ${emailError.message}`);
            console.error('Email error stack:', emailError.stack);
            // Continue even if email fails - don't block the payment success response
        }
    }

    res.status(200).json({
        status: 'success',
        timestamp: getCurrentUTC(),
        data: result.data
    });
});

exports.getPaymentDetails = catchAsync(async (req, res) => {
    const { paymentId } = req.params;
    const payment = await PaymentService.getPaymentDetails(paymentId);
    
    res.status(200).json({
        status: 'success',
        timestamp: getCurrentUTC(),
        data: payment
    });
});

exports.handleWebhook = catchAsync(async (req, res) => {
    const isValid = WebhookService.validateWebhook(req.headers, req.body);
    
    if (!isValid) {
        return res.status(400).json({
            status: 'error',
            timestamp: getCurrentUTC(),
            message: 'Invalid webhook signature'
        });
    }

    await WebhookService.processWebhookEvent(req.body);
    
    res.status(200).json({
        status: 'success',
        timestamp: getCurrentUTC()
    });
});

exports.getPaymentHistory = catchAsync(async (req, res) => {
    const { startDate, endDate, status, page = 1, limit = 10 } = req.query;
    const userId = req.user.id;
    const role = req.user.role;

    const payments = await PaymentService.getPaymentHistory({
        userId,
        role,
        startDate,
        endDate,
        status,
        page: parseInt(page),
        limit: parseInt(limit)
    });

    res.status(200).json({
        status: 'success',
        timestamp: getCurrentUTC(),
        data: payments
    });
});

exports.getPaymentAnalytics = catchAsync(async (req, res) => {
    const { startDate, endDate } = req.query;
    const userId = req.user.id;
    const role = req.user.role;

    const analytics = await PaymentService.getPaymentAnalytics({
        userId,
        role,
        startDate,
        endDate
    });

    res.status(200).json({
        status: 'success',
        timestamp: getCurrentUTC(),
        data: analytics
    });
});

exports.getRefundHistory = catchAsync(async (req, res) => {
    const { startDate, endDate, status, page = 1, limit = 10 } = req.query;
    const userId = req.user.id;
    const role = req.user.role;

    const refunds = await PaymentService.getRefundHistory({
        userId,
        role,
        startDate,
        endDate,
        status,
        page: parseInt(page),
        limit: parseInt(limit)
    });

    res.status(200).json({
        status: 'success',
        timestamp: getCurrentUTC(),
        data: refunds
    });
});

exports.getPendingPayments = catchAsync(async (req, res) => {
    const userId = req.user.id;
    const role = req.user.role;

    const pendingPayments = await PaymentService.getPendingPayments(userId, role);

    res.status(200).json({
        status: 'success',
        timestamp: getCurrentUTC(),
        data: pendingPayments
    });
});

exports.getReceipt = catchAsync(async (req, res) => {
    const { paymentId } = req.params;
    const currentUser = req.user.username || 'J33WAKASUPUN';
    
    logger.info(`Generating receipt for payment: ${paymentId}`);

    const result = await PaymentService.generateReceipt(paymentId, currentUser);
    
    if (!result.success) {
        return res.status(404).json({
            success: false,
            timestamp: getCurrentUTC(),
            message: result.error,
            details: result.details
        });
    }

    // Send the PDF file
    res.download(result.data.pdfPath, `payment_receipt_${paymentId}.pdf`);
});