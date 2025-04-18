const Appointment = require('../models/Appointment');
const User = require('../models/User');
const emailService = require('../services/emailService');
const { getCurrentUTC } = require('../utils/dateTime');
const logger = require('../utils/logger');
const NotificationService = require('../services/notificationService');
const RefundService = require('../services/refundService');

// @desc    Create new appointment
// @route   POST /api/appointments
// @access  Private (Patient only)
exports.createAppointment = async (req, res, next) => {
    try {
        const { doctorId, dateTime, reasonForVisit, duration } = req.body;
        const patientId = req.user.id;

        console.log('Creating appointment with data:', {
            doctorId,
            patientId,
            dateTime,
            reasonForVisit,
            duration
        });

        // Create the appointment
        const appointment = await Appointment.create({
            doctorId,
            patientId,
            dateTime: new Date(dateTime),
            reasonForVisit,
            duration,
            status: 'pending_payment'
        });

        console.log('Appointment created:', appointment._id);

        // Fetch doctor and patient details for email
        const doctor = await User.findById(doctorId);
        const patient = await User.findById(patientId);

        console.log('Doctor details:', {
            id: doctor?._id,
            email: doctor?.email,
            name: doctor ? `${doctor.firstName} ${doctor.lastName}` : 'Not found'
        });
        
        console.log('Patient details:', {
            id: patient?._id,
            email: patient?.email,
            name: patient ? `${patient.firstName} ${patient.lastName}` : 'Not found'
        });

        // Send confirmation emails using new consolidated method
        try {
            console.log('Sending appointment emails...');
            
            // Create a populated appointment object for email
            const populatedAppointment = {
                ...appointment.toObject(),
                doctorId: doctor,
                patientId: patient
            };
            
            // Send emails to both doctor and patient
            const emailResult = await emailService.sendAppointmentEmails(
                populatedAppointment,
                'pending'
            );
            
            console.log('Appointment email result:', emailResult);
            logger.info(`Appointment confirmation emails sent for appointment ${appointment._id}`);
            
            // Create notifications
            await NotificationService.createAppointmentNotifications(
                populatedAppointment,
                `appointment_created`,
                `${doctor.firstName} ${doctor.lastName}`,
                `${patient.firstName} ${patient.lastName}`
            );
        } catch (emailError) {
            console.error('Detailed email error:', emailError);
            console.error('Stack trace:', emailError.stack);
            logger.error(`Failed to send appointment confirmation emails: ${emailError.message}`);
        }

        res.status(201).json({
            success: true,
            timestamp: getCurrentUTC(),
            message: 'Appointment created successfully',
            data: appointment
        });

    } catch (error) {
        console.error('Appointment creation error:', error);
        logger.error(`Error in createAppointment: ${error.message}`);
        next(error);
    }
};

// @desc    Get user's appointments
// @route   GET /api/appointments
// @access  Private
exports.getAppointments = async (req, res, next) => {
    try {
        const { status, startDate, endDate } = req.query;

        // Build query based on user role
        let query = {};
        if (req.user.role === 'patient') {
            query.patientId = req.user.id;
        } else if (req.user.role === 'doctor') {
            query.doctorId = req.user.id;
        }

        // Add status filter if provided
        if (status) {
            query.status = status;
        }

        // Add date range filter if provided
        if (startDate || endDate) {
            query.dateTime = {};
            if (startDate) query.dateTime.$gte = new Date(startDate);
            if (endDate) query.dateTime.$lte = new Date(endDate);
        }

        const appointments = await Appointment.find(query)
            .populate('patientId', 'firstName lastName profilePicture')
            .populate('doctorId', 'firstName lastName profilePicture doctorProfile')
            .sort({ dateTime: 1 });

        res.status(200).json({
            success: true,
            timestamp: getCurrentUTC(),
            count: appointments.length,
            data: appointments
        });

    } catch (error) {
        next(error);
    }
};

// @desc    Update appointment status (confirm/cancel)
// @route   PUT /api/appointments/:id/status
// @access  Private (Doctor only for confirm, Both for cancel)
exports.updateAppointmentStatus = async (req, res, next) => {
    try {
        const { status, reason } = req.body;
        const appointment = await Appointment.findById(req.params.id)
            .populate('doctorId', 'firstName lastName email')
            .populate('patientId', 'firstName lastName email');

        if (!appointment) {
            return res.status(404).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Appointment not found'
            });
        }

        // Check permissions
        if (req.user.role === 'doctor' && appointment.doctorId._id.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Not authorized to update this appointment'
            });
        }

        if (req.user.role === 'patient' && appointment.patientId._id.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Not authorized to update this appointment'
            });
        }

        // Handle status updates
        if (status === 'confirmed' && req.user.role !== 'doctor') {
            return res.status(403).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Only doctors can confirm appointments'
            });
        }

        // Previous status for logging
        const previousStatus = appointment.status;

        // Handle cancellation and refund
        if (status === 'cancelled') {
            appointment.cancellationReason = reason;
            appointment.cancelledBy = req.user.role;
            
            try {
                // Process refund
                const refundResult = await RefundService.processRefund(
                    appointment._id,
                    `Appointment cancelled by ${req.user.role}: ${reason}`
                );

                logger.info(`Refund processed for appointment ${appointment._id}. Refund ID: ${refundResult.data.refundId}`);

                // Send cancellation emails with the new method
                await emailService.sendAppointmentEmails(
                    appointment,
                    'cancelled',
                    reason
                );
            } catch (refundError) {
                logger.error(`Refund processing failed for appointment ${appointment._id}: ${refundError.message}`);
                
                // Still cancel the appointment but note the refund failure
                return res.status(200).json({
                    success: true,
                    timestamp: getCurrentUTC(),
                    message: 'Appointment cancelled but refund processing failed. Our team will process the refund manually.',
                    data: {
                        appointment,
                        refundError: refundError.message
                    }
                });
            }
            
            logger.info(`Appointment ${appointment._id} cancelled by ${req.user.role}. Timestamp: ${getCurrentUTC()}`);
        } else if (status === 'confirmed') {
            // Send confirmation emails using the new method
            await emailService.sendAppointmentEmails(
                appointment,
                'confirmed'
            );
            
            logger.info(`Appointment ${appointment._id} confirmed by doctor. Timestamp: ${getCurrentUTC()}`);
        }

        appointment.status = status;
        await appointment.save();

        // Create notifications
        await NotificationService.createAppointmentNotifications(
            appointment,
            `appointment_${status}`,
            `${appointment.doctorId.firstName} ${appointment.doctorId.lastName}`,
            `${appointment.patientId.firstName} ${appointment.patientId.lastName}`
        );

        res.status(200).json({
            success: true,
            timestamp: getCurrentUTC(),
            message: `Appointment ${status} successfully`,
            data: appointment
        });

    } catch (error) {
        logger.error(`Error updating appointment status: ${error.message}\nTimestamp: ${getCurrentUTC()}`);
        next(error);
    }
};

// @desc    Request appointment reschedule
// @route   POST /api/appointments/:id/reschedule
// @access  Private (Patient only)
exports.requestReschedule = async (req, res, next) => {
    try {
        const { newDateTime, reason } = req.body;
        const appointment = await Appointment.findById(req.params.id);

        if (!appointment) {
            return res.status(404).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Appointment not found'
            });
        }

        // Check if user is the patient
        if (req.user.role !== 'patient' || appointment.patientId.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Not authorized to reschedule this appointment'
            });
        }

        // Check if new slot is available
        const endDateTime = new Date(new Date(newDateTime).getTime() + appointment.duration * 60000);

        const conflictingAppointment = await Appointment.findOne({
            doctorId: appointment.doctorId,
            _id: { $ne: appointment._id },
            status: { $in: ['pending', 'confirmed'] },
            dateTime: {
                $lt: endDateTime,
                $gt: new Date(newDateTime)
            }
        });

        if (conflictingAppointment) {
            return res.status(400).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Selected time slot is not available'
            });
        }

        appointment.rescheduledFrom = appointment.dateTime;
        appointment.dateTime = new Date(newDateTime);
        appointment.status = 'pending';
        await appointment.save();

        res.status(200).json({
            success: true,
            timestamp: getCurrentUTC(),
            data: appointment
        });

    } catch (error) {
        next(error);
    }
};

// @desc    Add rating and feedback
// @route   POST /api/appointments/:id/rating
// @access  Private (Patient only)
exports.addRating = async (req, res, next) => {
    try {
        const { score, feedback, isAnonymous } = req.body;
        const appointment = await Appointment.findById(req.params.id);

        if (!appointment) {
            return res.status(404).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Appointment not found'
            });
        }

        // Check if user is the patient
        if (req.user.role !== 'patient' || appointment.patientId.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Not authorized to rate this appointment'
            });
        }

        // Check if appointment is completed
        if (appointment.status !== 'completed') {
            return res.status(400).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Can only rate completed appointments'
            });
        }

        appointment.rating = {
            score,
            feedback,
            isAnonymous
        };
        await appointment.save();

        res.status(200).json({
            success: true,
            timestamp: getCurrentUTC(),
            data: appointment
        });

    } catch (error) {
        next(error);
    }
};

// @desc    Get appointment history with status
// @route   GET /api/appointments/history
// @access  Private
exports.getAppointmentHistory = async (req, res, next) => {
    try {
        const { startDate, endDate, status } = req.query;

        // Build query based on user role
        let query = {};
        if (req.user.role === 'patient') {
            query.patientId = req.user.id;
        } else if (req.user.role === 'doctor') {
            query.doctorId = req.user.id;
        }

        // Add date range filter
        if (startDate || endDate) {
            query.dateTime = {};
            if (startDate) query.dateTime.$gte = new Date(startDate);
            if (endDate) query.dateTime.$lte = new Date(endDate);
        }

        // Add status filter if provided
        if (status) {
            query.status = status;
        }

        // Only get past appointments
        query.dateTime = { ...query.dateTime, $lt: new Date() };

        const appointments = await Appointment.find(query)
            .populate('patientId', 'firstName lastName profilePicture')
            .populate('doctorId', 'firstName lastName profilePicture doctorProfile')
            .sort({ dateTime: -1 }); // Most recent first

        res.status(200).json({
            success: true,
            timestamp: getCurrentUTC(),
            count: appointments.length,
            data: appointments
        });

    } catch (error) {
        next(error);
    }
};

// @desc    Get doctor's schedule (weekly/monthly view)
// @route   GET /api/appointments/schedule
// @access  Private (Doctor only)
exports.getDoctorSchedule = async (req, res, next) => {
    try {
        // Verify user is a doctor
        if (req.user.role !== 'doctor') {
            return res.status(403).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Only doctors can access schedule view'
            });
        }

        const { startDate, endDate, view = 'week' } = req.query;

        // Calculate date range if not provided
        const start = startDate ? new Date(startDate) : new Date();
        const end = endDate ? new Date(endDate) : new Date(start);

        // If view is 'week', set end to 7 days from start
        // If view is 'month', set end to 30 days from start
        if (!endDate) {
            end.setDate(end.getDate() + (view === 'week' ? 7 : 30));
        }

        const appointments = await Appointment.find({
            doctorId: req.user.id,
            dateTime: {
                $gte: start,
                $lte: end
            }
        })
            .populate('patientId', 'firstName lastName profilePicture')
            .sort({ dateTime: 1 });

        // Group appointments by date
        const schedule = appointments.reduce((acc, appointment) => {
            const date = appointment.dateTime.toISOString().split('T')[0];
            if (!acc[date]) {
                acc[date] = [];
            }
            acc[date].push(appointment);
            return acc;
        }, {});

        res.status(200).json({
            success: true,
            timestamp: getCurrentUTC(),
            data: {
                startDate: start,
                endDate: end,
                view,
                schedule
            }
        });

    } catch (error) {
        next(error);
    }
};

// @desc    Get appointment statistics
// @route   GET /api/appointments/stats
// @access  Private
exports.getAppointmentStats = async (req, res, next) => {
    try {
        const { startDate, endDate } = req.query;

        // Build query based on user role
        let query = {};
        if (req.user.role === 'patient') {
            query.patientId = req.user.id;
        } else if (req.user.role === 'doctor') {
            query.doctorId = req.user.id;
        }

        // Add date range if provided
        if (startDate || endDate) {
            query.dateTime = {};
            if (startDate) query.dateTime.$gte = new Date(startDate);
            if (endDate) query.dateTime.$lte = new Date(endDate);
        }

        // Get all appointments for statistics
        const appointments = await Appointment.find(query);

        // Calculate statistics
        const stats = {
            total: appointments.length,
            byStatus: {
                pending: 0,
                confirmed: 0,
                completed: 0,
                cancelled: 0,
                no_show: 0
            },
            cancelledBy: {
                patient: 0,
                doctor: 0
            },
            averageRating: 0,
            totalRated: 0
        };

        // Calculate detailed statistics
        appointments.forEach(appointment => {
            // Count by status
            stats.byStatus[appointment.status]++;

            // Count cancellations
            if (appointment.status === 'cancelled' && appointment.cancelledBy) {
                stats.cancelledBy[appointment.cancelledBy]++;
            }

            // Calculate ratings
            if (appointment.rating && appointment.rating.score) {
                stats.averageRating += appointment.rating.score;
                stats.totalRated++;
            }
        });

        // Calculate average rating
        if (stats.totalRated > 0) {
            stats.averageRating = stats.averageRating / stats.totalRated;
        }

        res.status(200).json({
            success: true,
            timestamp: getCurrentUTC(),
            data: stats
        });

    } catch (error) {
        next(error);
    }
};