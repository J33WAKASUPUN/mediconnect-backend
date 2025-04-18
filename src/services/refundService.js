const PayPal = require('@paypal/checkout-server-sdk');
const { client } = require('../config/paypal');
const Payment = require('../models/Payment');
const EmailService = require('./emailService');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { getCurrentUTC } = require('../utils/dateTime');

class RefundService {
    async processRefund(appointmentId, reason) {
        // Declare payment variable outside try block so it's accessible in catch
        let payment;
        
        try {
            // Find payment for the appointment
            payment = await Payment.findOne({ appointmentId }).populate({
                path: 'appointmentId',
                populate: [
                    { path: 'patientId', select: 'firstName lastName email' },
                    { path: 'doctorId', select: 'firstName lastName email' }
                ]
            });
            
            if (!payment) {
                throw new AppError('Payment not found for this appointment', 404);
            }

            if (payment.status === 'REFUNDED') {
                throw new AppError('Payment has already been refunded', 400);
            }

            // Create PayPal refund request
            const request = new PayPal.payments.CapturesRefundRequest(payment.transactionDetails.captureId);
            request.requestBody({
                amount: {
                    currency_code: payment.currency || 'USD',
                    value: payment.amount.toString()
                },
                note_to_payer: `Refund for cancelled appointment: ${reason}`
            });

            logger.info(`Processing refund for payment ${payment._id} at ${getCurrentUTC()}`);

            // Process the refund
            const refund = await client.execute(request);

            // Update payment status
            payment.status = 'REFUNDED';
            payment.refundDetails = {
                refundId: refund.result.id,
                reason: reason,
                refundedAt: new Date(),
                status: 'COMPLETED',
                amount: payment.amount
            };
            await payment.save();

            // Send email notification using the new consolidated method
            await EmailService.sendPaymentNotification(
                payment, 
                'refund_completed', 
                payment.appointmentId.patientId
            );

            logger.info(`Refund processed successfully: ${refund.result.id} at ${getCurrentUTC()}`);

            return {
                success: true,
                data: {
                    refundId: refund.result.id,
                    status: 'REFUNDED',
                    amount: payment.amount,
                    currency: payment.currency || 'USD'
                }
            };
        } catch (error) {
            // Log the error and update payment status if needed
            logger.error(`Refund processing failed: ${error.message} at ${getCurrentUTC()}`);
            
            if (payment) {
                payment.status = 'REFUND_FAILED';
                await payment.save();
            }
            
            throw new AppError(error.message || 'Refund processing failed', 500);
        }
    }
}

module.exports = new RefundService();