// src/services/notificationService.js

const Notification = require('../models/Notification');
const { getCurrentUTC } = require('../utils/dateTime');
const logger = require('../utils/logger');

class NotificationService {
    static async createNotification(userId, title, message, type, appointmentId, metadata = {}) {
        try {
            const notification = await Notification.create({
                userId,
                title,
                message,
                type,
                appointmentId,
                metadata,
                createdAt: getCurrentUTC()
            });
            
            logger.info(`Notification created: ${notification._id} for user ${userId} at ${getCurrentUTC()}`);
            return notification;
        } catch (error) {
            logger.error(`Notification creation failed: ${error.message} at ${getCurrentUTC()}`);
            return null;
        }
    }

    static async createAppointmentNotifications(appointment, type, doctorName, patientName) {
        try {
            // Standardize notification types to match email service
            const notificationTypes = {
                'appointment_created': { status: 'pending' },
                'appointment_confirmed': { status: 'confirmed' },
                'appointment_cancelled': { status: 'cancelled' },
                'appointment_rescheduled': { status: 'rescheduled' },
                'appointment_completed': { status: 'completed' }
            };
            
            // Map the notification type to a standard appointment status
            const status = notificationTypes[type]?.status || 'pending';
            
            // Generate appropriate titles and messages
            const notifications = {
                pending: {
                    doctor: {
                        title: `New Appointment Request`,
                        message: `Appointment requested with ${patientName} on ${new Date(appointment.dateTime).toLocaleString()}`
                    },
                    patient: {
                        title: `Appointment Requested`,
                        message: `Your appointment with Dr. ${doctorName} on ${new Date(appointment.dateTime).toLocaleString()} has been requested`
                    }
                },
                confirmed: {
                    doctor: {
                        title: `Appointment Confirmed`,
                        message: `Your appointment with ${patientName} on ${new Date(appointment.dateTime).toLocaleString()} is confirmed`
                    },
                    patient: {
                        title: `Appointment Confirmed`,
                        message: `Your appointment with Dr. ${doctorName} on ${new Date(appointment.dateTime).toLocaleString()} is confirmed`
                    }
                },
                cancelled: {
                    doctor: {
                        title: `Appointment Cancelled`,
                        message: `Appointment with ${patientName} on ${new Date(appointment.dateTime).toLocaleString()} has been cancelled`
                    },
                    patient: {
                        title: `Appointment Cancelled`,
                        message: `Your appointment with Dr. ${doctorName} on ${new Date(appointment.dateTime).toLocaleString()} has been cancelled`
                    }
                },
                rescheduled: {
                    doctor: {
                        title: `Appointment Rescheduled`,
                        message: `Appointment with ${patientName} has been rescheduled to ${new Date(appointment.dateTime).toLocaleString()}`
                    },
                    patient: {
                        title: `Appointment Rescheduled`,
                        message: `Your appointment with Dr. ${doctorName} has been rescheduled to ${new Date(appointment.dateTime).toLocaleString()}`
                    }
                },
                completed: {
                    doctor: {
                        title: `Appointment Completed`,
                        message: `Your appointment with ${patientName} on ${new Date(appointment.dateTime).toLocaleString()} is marked as completed`
                    },
                    patient: {
                        title: `Appointment Completed`,
                        message: `Your appointment with Dr. ${doctorName} on ${new Date(appointment.dateTime).toLocaleString()} is complete`
                    }
                }
            };

            const notificationData = notifications[status];
            if (!notificationData) {
                logger.error(`Invalid notification type: ${type}`);
                return false;
            }

            // Create notification for doctor
            await this.createNotification(
                appointment.doctorId._id || appointment.doctorId,
                notificationData.doctor.title,
                notificationData.doctor.message,
                type,
                appointment._id,
                { status }
            );

            // Create notification for patient
            await this.createNotification(
                appointment.patientId._id || appointment.patientId,
                notificationData.patient.title,
                notificationData.patient.message,
                type,
                appointment._id,
                { status }
            );

            logger.info(`Created ${status} notifications for appointment ${appointment._id} at ${getCurrentUTC()}`);
            return true;
        } catch (error) {
            logger.error(`Failed to create appointment notifications: ${error.message} at ${getCurrentUTC()}`);
            return false;
        }
    }

    static async createPaymentNotification(payment, type, additionalData = {}) {
        try {
            // Ensure payment has necessary related data
            payment = await payment.populate({
                path: 'appointmentId',
                populate: [
                    { path: 'patientId', select: 'firstName lastName email' },
                    { path: 'doctorId', select: 'firstName lastName email' }
                ]
            });

            const notificationTypes = {
                payment_completed: {
                    title: 'Payment Successful',
                    message: `Your payment of $${payment.amount} has been processed successfully.`
                },
                payment_failed: {
                    title: 'Payment Failed',
                    message: `Your payment of $${payment.amount} could not be processed.`
                },
                refund_initiated: {
                    title: 'Refund Initiated',
                    message: `A refund of $${payment.refundDetails?.amount || payment.amount} has been initiated.`
                },
                refund_completed: {
                    title: 'Refund Completed',
                    message: `Your refund of $${payment.refundDetails?.amount || payment.amount} has been processed.`
                }
            };

            const notification = notificationTypes[type];
            if (!notification) {
                throw new Error(`Invalid notification type: ${type}`);
            }

            // Create notification for patient
            const notificationRecord = await Notification.create({
                userId: payment.appointmentId.patientId._id,
                title: notification.title,
                message: notification.message,
                type: type,
                appointmentId: payment.appointmentId._id,
                metadata: {
                    paymentId: payment._id,
                    amount: payment.amount,
                    ...additionalData
                },
                createdAt: getCurrentUTC()
            });

            logger.info(`Payment notification created: ${notificationRecord._id} for type: ${type} at ${getCurrentUTC()}`);
            return true;
        } catch (error) {
            logger.error(`Failed to create payment notification: ${error.message} at ${getCurrentUTC()}`);
            return false;
        }
    }

    static async markPaymentNotificationsAsRead(userId, paymentId) {
        try {
            const result = await Notification.updateMany(
                {
                    userId,
                    'metadata.paymentId': paymentId,
                    isRead: false
                },
                {
                    isRead: true,
                    updatedAt: getCurrentUTC()
                }
            );
            
            logger.info(`Marked ${result.nModified} payment notifications as read for user ${userId} at ${getCurrentUTC()}`);
            return true;
        } catch (error) {
            logger.error(`Failed to mark payment notifications as read: ${error.message} at ${getCurrentUTC()}`);
            return false;
        }
    }
}

module.exports = NotificationService;