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

exports.getReceiptWithToken = catchAsync(async (req, res) => {
    const { paymentId } = req.params;
    const token = req.query.token;

    console.log(`Receipt request received for paymentId: ${paymentId}`);
    console.log(`Token received: ${token ? 'Yes (length: ' + token.length + ')' : 'No'}`);

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Authentication token is required'
        });
    }

    try {
        // Verify the token
        const jwt = require('jsonwebtoken');
        console.log(`JWT Secret length: ${process.env.JWT_SECRET ? process.env.JWT_SECRET.length : 'undefined'}`);

        // Log the token format - don't log the full token in production
        console.log(`Token format check: ${token.substring(0, 10)}...`);

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        console.log(`Token verified successfully - User: ${decoded.id}, Role: ${decoded.role}`);

        // Set the user from token
        req.user = {
            id: decoded.id,
            role: decoded.role,
            username: decoded.username || 'J33WAKASUPUN'
        };

        // Generate the receipt PDF
        const result = await PaymentService.generateReceipt(paymentId, req.user.username);

        if (!result.success) {
            console.log(`Receipt generation failed: ${result.error}`);
            return res.status(404).json({
                success: false,
                message: result.error
            });
        }

        console.log(`Receipt generated successfully at path: ${result.data.pdfPath}`);

        // Set proper content type for PDF
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="receipt_${paymentId}.pdf"`);

        // Send the file
        return res.sendFile(result.data.pdfPath, {
            root: process.cwd(), // Use absolute path
        });

    } catch (error) {
        console.error(`Token verification failed: ${error.message}`);
        console.error(`Token verification error stack: ${error.stack}`);
        return res.status(401).json({
            success: false,
            message: 'Invalid authentication token',
            error: error.message
        });
    }
});

exports.getReceiptWithQueryToken = catchAsync(async (req, res) => {
    const { paymentId } = req.params;
    const token = req.query.token;

    console.log(`Receipt request with query token for paymentId: ${paymentId}`);

    if (!token) {
        return res.status(401).json({
            success: false,
            timestamp: getCurrentUTC(),
            message: 'Authentication token is missing'
        });
    }

    try {
        // Verify the token
        const decoded = require('jsonwebtoken').verify(
            token,
            process.env.JWT_SECRET
        );

        // Set the user from token
        const user = {
            id: decoded.id,
            role: decoded.role,
            username: decoded.username || 'J33WAKASUPUN'
        };

        logger.info(`Token verified for user: ${user.username}`);

        // Generate the receipt PDF
        const result = await PaymentService.generateReceipt(paymentId, user.username);

        if (!result.success) {
            return res.status(404).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: result.error,
                details: result.details
            });
        }

        // Send the PDF for inline viewing
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="payment_receipt_${paymentId}.pdf"`);

        // Use sendFile for inline viewing
        return res.sendFile(result.data.pdfPath, {
            root: process.cwd(), // Make sure to use an absolute path
            headers: {
                'Content-Type': 'application/pdf'
            }
        });
    } catch (error) {
        console.error(`Token verification failed: ${error.message}`);
        return res.status(401).json({
            success: false,
            timestamp: getCurrentUTC(),
            message: 'Invalid authentication token'
        });
    }
});

exports.getReceiptToken = catchAsync(async (req, res) => {
    const { paymentId } = req.params;

    // This route is protected by the auth middleware, so we know the user is authenticated
    const userId = req.user.id;
    const role = req.user.role;

    // Generate a receipt token
    const jwt = require('jsonwebtoken');

    try {
        // Generate a short-lived token specifically for this receipt
        const receiptToken = jwt.sign(
            { purpose: 'receipt_access', paymentId: paymentId },
            process.env.JWT_SECRET,
            { expiresIn: '10m' } // Token expires in 10 minutes
        );

        return res.status(200).json({
            success: true,
            data: {
                receiptToken,
                expiresIn: '10 minutes'
            }
        });
    } catch (error) {
        console.error(`Failed to generate receipt token: ${error.message}`);
        return res.status(500).json({
            success: false,
            error: 'Failed to generate receipt token'
        });
    }
});

exports.viewReceiptWithSpecialToken = catchAsync(async (req, res) => {
    const { paymentId } = req.params;
    const { receiptToken } = req.query;

    console.log(`Viewing receipt with token for payment: ${paymentId}`);

    if (!receiptToken) {
        return res.status(401).json({
            success: false,
            message: 'Receipt token is required'
        });
    }

    try {
        // Verify the receipt token
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(receiptToken, process.env.JWT_SECRET);

        // Check if this token was generated for this receipt
        if (decoded.purpose !== 'receipt_access' || decoded.paymentId !== paymentId) {
            return res.status(403).json({
                success: false,
                message: 'Invalid receipt token'
            });
        }

        console.log(`Token verified for receipt access: ${paymentId}`);

        // Generate receipt PDF
        const result = await PaymentService.generateReceipt(paymentId, 'ReceiptViewer');

        if (!result.success) {
            console.error(`Receipt generation failed: ${result.error}`);
            return res.status(404).json({
                success: false,
                message: result.error
            });
        }

        const fs = require('fs');

        // Log file details for debugging
        console.log(`=========== SERVING PDF ============`);
        console.log(`File path: ${result.data.pdfPath}`);
        console.log(`File exists: ${fs.existsSync(result.data.pdfPath)}`);
        console.log(`File size: ${fs.existsSync(result.data.pdfPath) ? fs.statSync(result.data.pdfPath).size : 'N/A'} bytes`);
        console.log(`====================================`);

        if (!fs.existsSync(result.data.pdfPath)) {
            return res.status(404).json({
                success: false,
                message: 'Receipt PDF file not found'
            });
        }

        // Read the file directly
        const fileContent = fs.readFileSync(result.data.pdfPath);

        // Set proper content type and other headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Length', fileContent.length);
        res.setHeader('Content-Disposition', `inline; filename="receipt_${paymentId}.pdf"`);

        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        // Send the file content directly instead of using sendFile
        return res.send(fileContent);
    } catch (error) {
        console.error(`Receipt token verification or serving failed: ${error.message}`);
        console.error(`Error stack: ${error.stack}`);
        return res.status(500).json({
            success: false,
            message: 'Error serving receipt',
            error: error.message
        });
    }
});

exports.getReceiptDetails = catchAsync(async (req, res) => {
    const { paymentId } = req.params;

    // This route is protected by the auth middleware, so we know the user is authenticated
    const userId = req.user.id;
    const role = req.user.role;

    try {
        // Get payment details with populated data
        const payment = await Payment.findById(paymentId)
            .populate({
                path: 'appointmentId',
                populate: [
                    { path: 'patientId', select: 'firstName lastName email' },
                    { path: 'doctorId', select: 'firstName lastName email specialization' }
                ]
            });

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: 'Payment not found'
            });
        }

        // Check if user has permission to access this payment
        let hasPermission = false;

        if (role === 'admin') {
            hasPermission = true;
        } else if (role === 'doctor' &&
            payment.appointmentId &&
            payment.appointmentId.doctorId &&
            payment.appointmentId.doctorId._id.toString() === userId) {
            hasPermission = true;
        } else if (role === 'patient' &&
            payment.appointmentId &&
            payment.appointmentId.patientId &&
            payment.appointmentId.patientId._id.toString() === userId) {
            hasPermission = true;
        }

        if (!hasPermission) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to access this payment'
            });
        }

        // Format the response with all receipt details
        const receiptData = {
            receiptNumber: `RCP-${payment._id.toString().substring(0, 8)}`,
            date: payment.createdAt,
            payment: {
                _id: payment._id,
                amount: payment.amount,
                currency: payment.currency,
                status: payment.status,
                createdAt: payment.createdAt,
                transactionDetails: payment.transactionDetails || {}
            },
            appointment: payment.appointmentId ? {
                _id: payment.appointmentId._id,
                dateTime: payment.appointmentId.dateTime,
                duration: payment.appointmentId.duration,
                status: payment.appointmentId.status,
                reasonForVisit: payment.appointmentId.reasonForVisit
            } : null,
            patient: payment.appointmentId?.patientId ? {
                _id: payment.appointmentId.patientId._id,
                firstName: payment.appointmentId.patientId.firstName,
                lastName: payment.appointmentId.patientId.lastName,
                email: payment.appointmentId.patientId.email
            } : null,
            doctor: payment.appointmentId?.doctorId ? {
                _id: payment.appointmentId.doctorId._id,
                firstName: payment.appointmentId.doctorId.firstName,
                lastName: payment.appointmentId.doctorId.lastName,
                email: payment.appointmentId.doctorId.email,
                specialization: payment.appointmentId.doctorId.specialization
            } : null,
        };

        return res.status(200).json({
            success: true,
            data: receiptData
        });
    } catch (error) {
        console.error(`Failed to get receipt details: ${error.message}`);
        return res.status(500).json({
            success: false,
            error: 'Failed to get receipt details'
        });
    }
});

exports.processRefund = catchAsync(async (req, res) => {
    const { paymentId } = req.params;
    const { reason } = req.body;

    const result = await RefundService.processRefund(paymentId, reason);

    res.status(200).json({
        status: 'success',
        timestamp: getCurrentUTC(),
        data: result
    });
});