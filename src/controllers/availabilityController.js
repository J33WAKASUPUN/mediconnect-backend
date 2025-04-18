// src/controllers/availabilityController.js
const User = require('../models/User');
const Appointment = require('../models/Appointment');
const { getCurrentUTC } = require('../utils/dateTime');

// @desc    Get doctor's available time slots
// @route   GET /api/availability/:doctorId
// @access  Private
exports.getAvailableSlots = async (req, res, next) => {
    try {
        const { date } = req.query;
        const { doctorId } = req.params;

        // Get doctor's schedule
        const doctor = await User.findOne({ _id: doctorId, role: 'doctor' })
            .select('doctorProfile.availableTimeSlots');

        if (!doctor) {
            return res.status(404).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Doctor not found'
            });
        }

        // Get the day of week for the requested date
        const requestedDate = new Date(date);
        const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][requestedDate.getDay()];

        // Find doctor's schedule for that day
        const daySchedule = doctor.doctorProfile.availableTimeSlots.find(
            schedule => schedule.day === dayOfWeek
        );

        if (!daySchedule) {
            return res.status(200).json({
                success: true,
                timestamp: getCurrentUTC(),
                data: {
                    date,
                    availableSlots: []
                }
            });
        }

        // Get existing appointments for that date
        const startOfDay = new Date(date);
        startOfDay.setUTCHours(0, 0, 0, 0);
        
        const endOfDay = new Date(date);
        endOfDay.setUTCHours(23, 59, 59, 999);

        const existingAppointments = await Appointment.find({
            doctorId,
            dateTime: {
                $gte: startOfDay,
                $lte: endOfDay
            },
            status: { $in: ['pending', 'confirmed'] }
        });

        // Calculate available slots
        const availableSlots = daySchedule.slots.map(slot => {
            const [startHour, startMinute] = slot.startTime.split(':');
            const [endHour, endMinute] = slot.endTime.split(':');

            const slotStart = new Date(date);
            slotStart.setUTCHours(parseInt(startHour), parseInt(startMinute), 0, 0);

            const slotEnd = new Date(date);
            slotEnd.setUTCHours(parseInt(endHour), parseInt(endMinute), 0, 0);

            // Check if slot is already booked
            const isBooked = existingAppointments.some(appointment => {
                const appointmentEnd = new Date(appointment.dateTime.getTime() + appointment.duration * 60000);
                return (
                    appointment.dateTime < slotEnd && 
                    appointmentEnd > slotStart
                );
            });

            return {
                startTime: slot.startTime,
                endTime: slot.endTime,
                isAvailable: !isBooked
            };
        });

        res.status(200).json({
            success: true,
            timestamp: getCurrentUTC(),
            data: {
                date,
                availableSlots
            }
        });

    } catch (error) {
        next(error);
    }
};

// @desc    Update doctor's available time slots
// @route   PUT /api/availability
// @access  Private (Doctor only)
exports.updateAvailability = async (req, res, next) => {
    try {
        if (req.user.role !== 'doctor') {
            return res.status(403).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Only doctors can update availability'
            });
        }

        const { availableTimeSlots } = req.body;

        // Validate time slots format
        const isValidFormat = availableTimeSlots.every(schedule => {
            return schedule.slots.every(slot => {
                const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
                return (
                    timeRegex.test(slot.startTime) &&
                    timeRegex.test(slot.endTime) &&
                    slot.startTime < slot.endTime
                );
            });
        });

        if (!isValidFormat) {
            return res.status(400).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Invalid time slot format'
            });
        }

        const updatedDoctor = await User.findByIdAndUpdate(
            req.user.id,
            {
                'doctorProfile.availableTimeSlots': availableTimeSlots,
                updatedAt: getCurrentUTC()
            },
            { new: true }
        ).select('doctorProfile.availableTimeSlots');

        res.status(200).json({
            success: true,
            timestamp: getCurrentUTC(),
            data: updatedDoctor.doctorProfile.availableTimeSlots
        });

    } catch (error) {
        next(error);
    }
};