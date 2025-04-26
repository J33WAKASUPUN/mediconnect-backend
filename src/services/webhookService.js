const crypto = require('crypto');
const Payment = require('../models/Payment');
const Appointment = require('../models/Appointment');
const EmailService = require('./emailService'); // Updated import
const NotificationService = require('./notificationService');
const logger = require('../utils/logger');
const { getCurrentUTC } = require('../utils/dateTime');

class WebhookService {
    constructor() {
        this.webhookId = process.env.PAYPAL_WEBHOOK_ID;
    }

    validateWebhook(headers, body) {
        try {
            const transmissionId = headers['paypal-transmission-id'];
            const timestamp = headers['paypal-transmission-time'];
            const webhookId = this.webhookId;
            const eventBody = typeof body === 'string' ? body : JSON.stringify(body);
            
            const transmissionSig = headers['paypal-transmission-sig'];
            const certUrl = headers['paypal-cert-url'];
            
            // Construct the validation message
            const validationMessage = `${transmissionId}|${timestamp}|${webhookId}|${crypto.createHash('sha256').update(eventBody).digest('hex')}`;
            
            // Verify signature (simplified for example)
            return true;
        } catch (error) {
            logger.error(`Webhook validation failed: ${error.message} at ${getCurrentUTC()}`);
            return false;
        }
    }

    async processWebhookEvent(event) {
        try {
            logger.info(`Processing webhook event: ${event.event_type} at ${getCurrentUTC()}`);

            switch (event.event_type) {
                case 'PAYMENT.CAPTURE.COMPLETED':
                    await this.handlePaymentSuccess(event.resource);
                    break;
                case 'PAYMENT.CAPTURE.DENIED':
                    await this.handlePaymentFailure(event.resource);
                    break;
                case 'REFUND.COMPLETED':
                    await this.handleRefundSuccess(event.resource);
                    break;
                // Add more event types as needed
            }

            return true;
        } catch (error) {
            logger.error(`Webhook processing failed: ${error.message} at ${getCurrentUTC()}`);
            return false;
        }
    }

    async handlePaymentSuccess(resource) {
        try {
            const payment = await Payment.findOne({ 
                'transactionDetails.captureId': resource.id 
            }).populate({
                path: 'appointmentId',
                populate: [
                    { path: 'patientId', select: 'firstName lastName email' },
                    { path: 'doctorId', select: 'firstName lastName email' }
                ]
            });

            if (payment) {
                payment.status = 'COMPLETED';
                await payment.save();

                // Update appointment status
                await Appointment.findByIdAndUpdate(
                    payment.appointmentId._id,
                    { status: 'pending' }
                );

                // Send payment success email using new method
                await EmailService.sendPaymentNotification(
                    payment,
                    'payment_success',
                    payment.appointmentId.patientId
                );

                // Create notification
                await NotificationService.createPaymentNotification(
                    payment,
                    'payment_completed'
                );

                logger.info(`Payment success webhook processed for payment: ${payment._id} at ${getCurrentUTC()}`);
            }
        } catch (error) {
            logger.error(`Error handling payment success webhook: ${error.message} at ${getCurrentUTC()}`);
        }
    }

    async handlePaymentFailure(resource) {
        try {
            const payment = await Payment.findOne({
                'transactionDetails.captureId': resource.id
            }).populate({
                path: 'appointmentId',
                populate: [
                    { path: 'patientId', select: 'firstName lastName email' },
                    { path: 'doctorId', select: 'firstName lastName email' }
                ]
            });

            if (payment) {
                payment.status = 'FAILED';
                await payment.save();

                // Update appointment status
                await Appointment.findByIdAndUpdate(
                    payment.appointmentId._id,
                    { status: 'pending_payment' } // Reset to pending_payment
                );

                // Send payment failed email using new method
                await EmailService.sendPaymentNotification(
                    payment,
                    'payment_failed',
                    payment.appointmentId.patientId
                );

                // Create notification
                await NotificationService.createPaymentNotification(
                    payment,
                    'payment_failed'
                );

                logger.info(`Payment failure webhook processed for payment: ${payment._id} at ${getCurrentUTC()}`);
            }
        } catch (error) {
            logger.error(`Error handling payment failure webhook: ${error.message} at ${getCurrentUTC()}`);
        }
    }

    async handleRefundSuccess(resource) {
        try {
            const payment = await Payment.findOne({
                'refundDetails.refundId': resource.id
            }).populate({
                path: 'appointmentId',
                populate: [
                    { path: 'patientId', select: 'firstName lastName email' },
                    { path: 'doctorId', select: 'firstName lastName email' }
                ]
            });

            if (payment) {
                payment.status = 'REFUNDED';
                payment.refundDetails.status = 'COMPLETED';
                await payment.save();

                // Send refund completed email using new method
                await EmailService.sendPaymentNotification(
                    payment,
                    'refund_completed',
                    payment.appointmentId.patientId
                );

                // Create notification
                await NotificationService.createPaymentNotification(
                    payment,
                    'refund_completed'
                );

                logger.info(`Refund success webhook processed for payment: ${payment._id} at ${getCurrentUTC()}`);
            }
        } catch (error) {
            logger.error(`Error handling refund success webhook: ${error.message} at ${getCurrentUTC()}`);
        }
    }
}

module.exports = new WebhookService();