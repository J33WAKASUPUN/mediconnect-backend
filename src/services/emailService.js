const nodemailer = require('nodemailer');
const handlebars = require('handlebars');
const fs = require('fs');
const path = require('path');
const { getCurrentUTC } = require('../utils/dateTime');
const logger = require('../utils/logger');

class EmailService {
    constructor() {
        console.log('Initializing Email Service...');
        console.log('Email User:', process.env.EMAIL_USER);
        console.log('Email Pass exists:', !!process.env.EMAIL_PASS);

        // Add more detailed SMTP configuration
        this.transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            },
            debug: true,
            logger: true
        });

        // Test email configuration
        this.transporter.verify((error, success) => {
            if (error) {
                console.error('SMTP connection error:', error);
            } else {
                console.log('Server is ready to take our messages');
            }
        });

        try {
            // Pre-compile email templates with new standardized names
            this.templates = {
                // Appointment templates
                appointmentConfirmation: this.compileTemplate('appointment-confirmation.handlebars'),
                appointmentCancellation: this.compileTemplate('appointment-cancellation.handlebars'),
                appointmentDoctorNotification: this.compileTemplate('appointment-doctor-notification.handlebars'),
                appointmentPatientConfirmation: this.compileTemplate('appointment-patient-confirmation.handlebars'),
                appointmentStatusUpdate: this.compileTemplate('appointment-status-update.handlebars'),
                doctorScheduleUpdate: this.compileTemplate('doctor-schedule-update.handlebars'),

                // Payment templates
                paymentSuccess: this.compileTemplate('payment-success.handlebars'),
                paymentFailed: this.compileTemplate('payment-failed.handlebars'),

                // Refund templates
                refundInitiated: this.compileTemplate('refund-initiated.handlebars'),
                refundCompleted: this.compileTemplate('refund-completed.handlebars')
            };

            console.log('Email templates compiled successfully');
            console.log('Available templates:', Object.keys(this.templates));
        } catch (error) {
            console.error('Error compiling templates:', error);
            throw error;
        }
    }

    compileTemplate(templateName) {
        const templatePath = path.join(__dirname, '../templates/emailTemplates', templateName);
        console.log('Loading template from:', templatePath);

        if (!fs.existsSync(templatePath)) {
            console.error(`Template file not found: ${templatePath}`);
            throw new Error(`Template file not found: ${templatePath}`);
        }

        const templateContent = fs.readFileSync(templatePath, 'utf8');
        return handlebars.compile(templateContent);
    }

    // Single consolidated method for sending emails
    async sendEmail(to, subject, template, data) {
        try {
            console.log('Sending email:', {
                to,
                subject,
                template,
                data: JSON.stringify(data, null, 2)
            });

            if (!this.templates[template]) {
                throw new Error(`Template '${template}' not found. Available templates: ${Object.keys(this.templates).join(', ')}`);
            }

            const html = this.templates[template](data);

            const mailOptions = {
                from: `"MediConnect System" <${process.env.EMAIL_USER}>`,
                to,
                subject,
                html
            };

            const info = await this.transporter.sendMail(mailOptions);
            console.log('Email sent successfully:', info.messageId);
            return true;
        } catch (error) {
            console.error('Detailed email error:', error);
            console.error('Stack trace:', error.stack);
            logger.error(`Email sending failed: ${error.message}`);
            return false;
        }
    }

    // Consolidated appointment notification method
    async sendAppointmentNotification(appointment, recipient, type) {
        try {
            console.log(`Sending ${type} notification for appointment ${appointment._id} to ${recipient.email}`);

            // Define template mapping for different notification types
            const templateMap = {
                'pending': recipient.role === 'doctor' ? 'appointmentDoctorNotification' : 'appointmentPatientConfirmation',
                'confirmed': 'appointmentConfirmation',
                'cancelled': 'appointmentCancellation',
                'rescheduled': 'appointmentStatusUpdate',
                'completed': 'appointmentStatusUpdate',
                'no_show': 'appointmentStatusUpdate'
            };

            const template = templateMap[type];
            if (!template) {
                throw new Error(`No template found for appointment status: ${type}`);
            }

            const data = {
                recipientName: `${recipient.firstName} ${recipient.lastName}`,
                doctorName: `${appointment.doctorId.firstName} ${appointment.doctorId.lastName}`,
                patientName: `${appointment.patientId.firstName} ${appointment.patientId.lastName}`,
                appointmentDate: new Date(appointment.dateTime).toLocaleDateString(),
                appointmentTime: new Date(appointment.dateTime).toLocaleTimeString(),
                location: appointment.location || 'Main Clinic',
                reasonForVisit: appointment.reasonForVisit,
                status: type,
                statusClass: type.toLowerCase(),
                isPending: type === 'pending',
                isConfirmed: type === 'confirmed',
                nextSteps: this.getNextSteps(type, recipient.role === 'patient')
            };

            // Add cancellation specific details if applicable
            if (type === 'cancelled' && appointment.cancellationReason) {
                data.cancellationReason = appointment.cancellationReason;
                data.cancelledByName = appointment.cancelledBy === 'doctor'
                    ? `Dr. ${appointment.doctorId.firstName} ${appointment.doctorId.lastName}`
                    : `${appointment.patientId.firstName} ${appointment.patientId.lastName}`;
            }

            const subject = `Appointment ${type.charAt(0).toUpperCase() + type.slice(1)} - MediConnect`;

            return await this.sendEmail(recipient.email, subject, template, data);
        } catch (error) {
            console.error(`Error sending notification for ${type} appointment:`, error);
            logger.error(`Failed to send ${type} appointment notification: ${error.message}\nTimestamp: ${getCurrentUTC()}`);
            return false;
        }
    }

    // Unified method for sending appointment emails to both doctor and patient
    async sendAppointmentEmails(appointment, type, reason = null) {
        try {
            // Update the appointment object with full doctor and patient info if needed
            if (!appointment.doctorId.firstName) {
                appointment.doctorId = await User.findById(appointment.doctorId);
            }

            if (!appointment.patientId.firstName) {
                appointment.patientId = await User.findById(appointment.patientId);
            }

            // If cancellation, update appointment with reason
            if (type === 'cancelled' && reason) {
                appointment.cancellationReason = reason;
            }

            // Send to doctor
            await this.sendAppointmentNotification(
                appointment,
                appointment.doctorId,
                type
            );

            // Send to patient
            await this.sendAppointmentNotification(
                appointment,
                appointment.patientId,
                type
            );

            logger.info(`${type} emails sent for appointment ${appointment._id}`);
            return true;
        } catch (error) {
            logger.error(`Failed to send ${type} emails: ${error.message}\nTimestamp: ${getCurrentUTC()}`);
            return false;
        }
    }

    async sendPaymentNotification(payment, type, recipient) {
        try {
            // First, make sure payment exists
            if (!payment) {
                console.error('Cannot send payment notification: payment is undefined');
                throw new Error('Payment is not defined');
            }

            // Check if recipient is valid
            if (!recipient) {
                console.error('Cannot send payment notification: recipient is undefined');
                throw new Error('Recipient is not defined');
            }

            // If recipient doesn't have an email property or it's undefined
            if (!recipient.email) {
                console.error(`Recipient missing email address: ${JSON.stringify(recipient)}`);

                // Try to lookup the user by ID if possible
                if (recipient._id) {
                    // Add this import at the top of the file if not already present
                    const User = require('../models/User');

                    try {
                        const user = await User.findById(recipient._id).select('email');

                        if (user && user.email) {
                            console.log(`Found email address for user ${recipient._id}: ${user.email}`);
                            recipient.email = user.email;
                        } else {
                            throw new Error('Invalid recipient: missing email address and could not be recovered');
                        }
                    } catch (err) {
                        console.error('Error looking up user email:', err);
                        throw new Error('Failed to retrieve user email');
                    }
                } else {
                    throw new Error('Invalid recipient: missing email address and _id');
                }
            }

            console.log(`Sending ${type} payment notification to ${recipient.email}`);

            // Ensure we have populated data
            let populatedPayment = payment;

            // Check if we need to populate the payment
            if (!payment.appointmentId || typeof payment.appointmentId === 'string') {
                populatedPayment = await Payment.findById(payment._id).populate({
                    path: 'appointmentId',
                    populate: [
                        { path: 'patientId', select: 'firstName lastName email' },
                        { path: 'doctorId', select: 'firstName lastName email' }
                    ]
                });
            } else if (!payment.appointmentId.patientId || typeof payment.appointmentId.patientId === 'string') {
                // We have appointmentId as an object but patient/doctor might still be IDs
                populatedPayment = await Payment.findById(payment._id).populate({
                    path: 'appointmentId',
                    populate: [
                        { path: 'patientId', select: 'firstName lastName email' },
                        { path: 'doctorId', select: 'firstName lastName email' }
                    ]
                });
            }

            if (!populatedPayment.appointmentId ||
                !populatedPayment.appointmentId.patientId ||
                !populatedPayment.appointmentId.doctorId) {
                throw new Error('Payment data could not be fully populated for email');
            }

            // Define template mapping
            const templateMap = {
                'payment_success': 'paymentSuccess',
                'payment_failed': 'paymentFailed',
                'refund_initiated': 'refundInitiated',
                'refund_completed': 'refundCompleted'
            };
            
            // Define subject line mapping
            const subjectMap = {
                'payment_success': 'Payment Successful',
                'payment_failed': 'Payment Failed',
                'refund_initiated': 'Refund Initiated',
                'refund_completed': 'Refund Completed'
            };
            
            const template = templateMap[type];
            if (!template) {
                throw new Error(`No template found for payment notification type: ${type}`);
            }
            
            const data = {
                patientName: `${payment.appointmentId.patientId.firstName} ${payment.appointmentId.patientId.lastName}`,
                doctorName: `${payment.appointmentId.doctorId.firstName} ${payment.appointmentId.doctorId.lastName}`,
                payment: payment.toObject ? payment.toObject() : payment,
                appointmentDate: new Date(payment.appointmentId.dateTime).toLocaleDateString(),
                appointmentTime: new Date(payment.appointmentId.dateTime).toLocaleTimeString(),
                timestamp: getCurrentUTC()
            };
            
            // Add refund details if applicable
            if (type.includes('refund') && payment.refundDetails) {
                data.refund = payment.refundDetails;
            }
            
            // Use the proper subject from the mapping, or fallback to a formatted version
            const subject = subjectMap[type] || type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            
            return await this.sendEmail(recipient.email, subject, template, data);
        } catch (error) {
            console.error(`Error sending payment notification:`, error);
            logger.error(`Failed to send payment notification: ${error.message}\nTimestamp: ${getCurrentUTC()}`);
            return false;
        }
    }

    // Helper methods
    getNextSteps(status, isPatient) {
        const nextSteps = {
            confirmed: {
                patient: 'Please arrive 10 minutes before your scheduled time. Remember to bring any relevant medical records.',
                doctor: 'The appointment has been added to your schedule.'
            },
            cancelled: {
                patient: 'You can schedule a new appointment through our platform or contact us for assistance.',
                doctor: 'This time slot is now available for other appointments.'
            },
            rescheduled: {
                patient: 'Please confirm if the new appointment time works for you.',
                doctor: 'Please review the new appointment time in your schedule.'
            }
        };

        return nextSteps[status]?.[isPatient ? 'patient' : 'doctor'] || '';
    }

    // For backward compatibility - will redirect to new methods
    async sendAppointmentConfirmation(appointment, recipient, recipientType = 'patient') {
        console.log('Legacy method sendAppointmentConfirmation called - redirecting to new implementation');
        const status = appointment.status || 'pending';
        return this.sendAppointmentNotification(appointment, recipient, status);
    }

    async sendAppointmentConfirmationEmails(appointment) {
        console.log('Legacy method sendAppointmentConfirmationEmails called - redirecting to new implementation');
        return this.sendAppointmentEmails(appointment, 'confirmed');
    }

    async sendAppointmentCancellationEmails(appointment, reason) {
        console.log('Legacy method sendAppointmentCancellationEmails called - redirecting to new implementation');
        return this.sendAppointmentEmails(appointment, 'cancelled', reason);
    }
}

module.exports = new EmailService();