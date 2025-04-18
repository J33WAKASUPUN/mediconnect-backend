const DoctorCalendar = require('../models/DoctorCalendar');
const Appointment = require('../models/Appointment');
const emailService = require('../services/emailService');
const { getCurrentUTC } = require('../utils/dateTime');
const logger = require('../utils/logger');

// @desc    Set default working hours
// @route   POST /api/calendar/working-hours
// @access  Private (Doctor only)
exports.setDefaultWorkingHours = async (req, res, next) => {
    try {
        const { defaultWorkingHours } = req.body;

        // Validate working hours format
        if (!Array.isArray(defaultWorkingHours)) {
            return res.status(400).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Default working hours must be an array'
            });
        }

        // Validate time slots format
        const isValidFormat = defaultWorkingHours.every(schedule => {
            if (!schedule.slots || !Array.isArray(schedule.slots)) return false;
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
                message: 'Invalid time slot format. Use HH:MM format and ensure start time is before end time'
            });
        }

        let calendar = await DoctorCalendar.findOne({ doctorId: req.user.id });

        if (!calendar) {
            calendar = await DoctorCalendar.create({
                doctorId: req.user.id,
                defaultWorkingHours,
                lastUpdated: getCurrentUTC()
            });

            // Send email notification for initial schedule setup
            await emailService.sendScheduleUpdate(
                req.user,
                defaultWorkingHours,
                getCurrentUTC()
            );
        } else {
            calendar.defaultWorkingHours = defaultWorkingHours;
            calendar.lastUpdated = getCurrentUTC();
            await calendar.save();

            // Send email notification for schedule update
            await emailService.sendScheduleUpdate(
                req.user,
                defaultWorkingHours,
                getCurrentUTC()
            );
        }

        res.status(200).json({
            success: true,
            timestamp: getCurrentUTC(),
            data: calendar
        });

    } catch (error) {
        logger.error(`Error in setDefaultWorkingHours: ${error.message}`);
        next(error);
    }
};

// @desc    Get doctor's calendar
// @route   GET /api/calendar/:doctorId
// @access  Private
exports.getCalendar = async (req, res, next) => {
    try {
        const { startDate, endDate } = req.query;
        
        if (!startDate || !endDate) {
            return res.status(400).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Please provide both start and end dates'
            });
        }

        const calendar = await DoctorCalendar.findOne({ 
            doctorId: req.params.doctorId,
            'schedule.date': {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            }
        }).populate('doctorId', 'firstName lastName');

        if (!calendar) {
            return res.status(404).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Calendar not found'
            });
        }

        res.status(200).json({
            success: true,
            timestamp: getCurrentUTC(),
            data: calendar
        });

    } catch (error) {
        logger.error(`Error in getCalendar: ${error.message}`);
        next(error);
    }
};

// @desc    Update specific date schedule
// @route   PUT /api/calendar/date/:date
// @access  Private (Doctor only)
exports.updateDateSchedule = async (req, res, next) => {
    try {
        const { slots, isHoliday, holidayReason } = req.body;
        const dateToUpdate = new Date(req.params.date);

        // Validate date
        if (isNaN(dateToUpdate.getTime())) {
            return res.status(400).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Invalid date format'
            });
        }

        // Validate slots format
        if (slots && Array.isArray(slots)) {
            const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
            const isValidSlots = slots.every(slot =>
                timeRegex.test(slot.startTime) &&
                timeRegex.test(slot.endTime) &&
                slot.startTime < slot.endTime
            );

            if (!isValidSlots) {
                return res.status(400).json({
                    success: false,
                    timestamp: getCurrentUTC(),
                    message: 'Invalid time slot format'
                });
            }
        }

        let calendar = await DoctorCalendar.findOne({ doctorId: req.user.id });

        if (!calendar) {
            return res.status(404).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Calendar not found'
            });
        }

        // Find existing date schedule
        const dateIndex = calendar.schedule.findIndex(
            s => s.date.toISOString().split('T')[0] === dateToUpdate.toISOString().split('T')[0]
        );

        if (dateIndex > -1) {
            // Remove duplicate slots and update
            const uniqueSlots = slots.reduce((acc, slot) => {
                const existingSlot = acc.find(s => 
                    s.startTime === slot.startTime && 
                    s.endTime === slot.endTime
                );
                if (!existingSlot) {
                    acc.push(slot);
                }
                return acc;
            }, []);

            calendar.schedule[dateIndex] = {
                date: dateToUpdate,
                slots: uniqueSlots,
                isHoliday,
                holidayReason
            };
        } else {
            calendar.schedule.push({
                date: dateToUpdate,
                slots,
                isHoliday,
                holidayReason
            });
        }

        calendar.lastUpdated = getCurrentUTC();
        await calendar.save();

        // Send email notification about schedule update
        await emailService.sendScheduleUpdate(
            req.user,
            slots,
            dateToUpdate
        );

        res.status(200).json({
            success: true,
            timestamp: getCurrentUTC(),
            data: calendar
        });

    } catch (error) {
        logger.error(`Error in updateDateSchedule: ${error.message}`);
        next(error);
    }
};

// @desc    Block time slot
// @route   POST /api/calendar/block-slot
// @access  Private (Doctor only)
exports.blockTimeSlot = async (req, res, next) => {
    try {
        const { date, startTime, endTime, reason } = req.body;

        // Validate time format
        const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
            return res.status(400).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Invalid time format. Use HH:MM format'
            });
        }

        // Validate date
        const dateToBlock = new Date(date);
        if (isNaN(dateToBlock.getTime())) {
            return res.status(400).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Invalid date format'
            });
        }

        let calendar = await DoctorCalendar.findOne({ doctorId: req.user.id });

        if (!calendar) {
            return res.status(404).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Calendar not found'
            });
        }

        // Check for existing appointments
        const existingAppointment = await Appointment.findOne({
            doctorId: req.user.id,
            dateTime: {
                $gte: dateToBlock,
                $lt: new Date(dateToBlock.getTime() + 24 * 60 * 60 * 1000)
            },
            status: { $in: ['pending', 'confirmed'] }
        });

        if (existingAppointment) {
            const appointmentTime = existingAppointment.dateTime.toTimeString().slice(0, 5);
            if (appointmentTime >= startTime && appointmentTime < endTime) {
                return res.status(400).json({
                    success: false,
                    timestamp: getCurrentUTC(),
                    message: 'Cannot block slot with existing appointment'
                });
            }
        }

        const dateIndex = calendar.schedule.findIndex(
            s => s.date.toISOString().split('T')[0] === dateToBlock.toISOString().split('T')[0]
        );

        const slot = {
            startTime,
            endTime,
            isBlocked: true,
            isBooked: false
        };

        if (dateIndex > -1) {
            // Remove any existing blocked slots for the same time
            calendar.schedule[dateIndex].slots = calendar.schedule[dateIndex].slots.filter(
                s => s.startTime !== startTime || s.endTime !== endTime
            );
            calendar.schedule[dateIndex].slots.push(slot);
        } else {
            calendar.schedule.push({
                date: dateToBlock,
                slots: [slot],
                isHoliday: false
            });
        }

        calendar.lastUpdated = getCurrentUTC();
        await calendar.save();

        // Send email notification about blocked slot
        await emailService.sendScheduleUpdate(
            req.user,
            [{
                startTime,
                endTime,
                isBlocked: true,
                reason
            }],
            dateToBlock
        );

        res.status(200).json({
            success: true,
            timestamp: getCurrentUTC(),
            data: calendar
        });

    } catch (error) {
        logger.error(`Error in blockTimeSlot: ${error.message}`);
        next(error);
    }
};

// @desc    Get available slots for a specific date
// @route   GET /api/calendar/available-slots/:doctorId/:date
// @access  Public
exports.getAvailableSlots = async (req, res, next) => {
    try {
        const { doctorId, date } = req.params;

        // Validate date
        const requestedDate = new Date(date);
        if (isNaN(requestedDate.getTime())) {
            return res.status(400).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Invalid date format'
            });
        }

        const calendar = await DoctorCalendar.findOne({ doctorId });

        if (!calendar) {
            return res.status(404).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Calendar not found'
            });
        }

        // Get day's schedule
        const daySchedule = calendar.schedule.find(
            s => s.date.toISOString().split('T')[0] === requestedDate.toISOString().split('T')[0]
        );

        // Get default working hours for that day
        const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][requestedDate.getDay()];
        const defaultSchedule = calendar.defaultWorkingHours.find(h => h.day === dayOfWeek);

        // Get existing appointments
        const appointments = await Appointment.find({
            doctorId,
            dateTime: {
                $gte: new Date(date),
                $lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1))
            },
            status: { $in: ['pending', 'confirmed'] }
        });

        // Combine and process slots
        let availableSlots = [];
        if (daySchedule && !daySchedule.isHoliday) {
            availableSlots = daySchedule.slots;
        } else if (!daySchedule && defaultSchedule && defaultSchedule.isWorking) {
            availableSlots = defaultSchedule.slots;
        }

        // Mark booked and blocked slots
        availableSlots = availableSlots
            .map(slot => ({
                ...slot.toObject(),
                isBooked: appointments.some(apt => {
                    const aptTime = new Date(apt.dateTime).toTimeString().slice(0, 5);
                    return aptTime === slot.startTime;
                })
            }))
            .filter(slot => !slot.isBlocked)
            .sort((a, b) => a.startTime.localeCompare(b.startTime));

        res.status(200).json({
            success: true,
            timestamp: getCurrentUTC(),
            data: {
                date: requestedDate,
                isHoliday: daySchedule?.isHoliday || false,
                holidayReason: daySchedule?.holidayReason,
                availableSlots
            }
        });

    } catch (error) {
        logger.error(`Error in getAvailableSlots: ${error.message}`);
        next(error);
    }
};

// @desc    Unblock time slot
// @route   DELETE /api/calendar/block-slot/:date/:slotId
// @access  Private (Doctor only)
exports.unblockTimeSlot = async (req, res, next) => {
    try {
        const { date, slotId } = req.params;

        const dateToUnblock = new Date(date);
        if (isNaN(dateToUnblock.getTime())) {
            return res.status(400).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Invalid date format'
            });
        }

        let calendar = await DoctorCalendar.findOne({ doctorId: req.user.id });

        if (!calendar) {
            return res.status(404).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Calendar not found'
            });
        }

        const dateIndex = calendar.schedule.findIndex(
            s => s.date.toISOString().split('T')[0] === dateToUnblock.toISOString().split('T')[0]
        );

        if (dateIndex === -1) {
            return res.status(404).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'No schedule found for this date'
            });
        }

        const slotIndex = calendar.schedule[dateIndex].slots.findIndex(
            slot => slot._id.toString() === slotId
        );

        if (slotIndex === -1) {
            return res.status(404).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Slot not found'
            });
        }

        // Get slot details before removing
        const unblockingSlot = calendar.schedule[dateIndex].slots[slotIndex];

        // Remove the blocked slot
        calendar.schedule[dateIndex].slots.splice(slotIndex, 1);
        calendar.lastUpdated = getCurrentUTC();
        await calendar.save();

        // Send email notification about unblocked slot
        await emailService.sendScheduleUpdate(
            req.user,
            [{
                startTime: unblockingSlot.startTime,
                endTime: unblockingSlot.endTime,
                isBlocked: false,
                message: 'Time slot has been unblocked'
            }],
            dateToUnblock
        );

        res.status(200).json({
            success: true,
            timestamp: getCurrentUTC(),
            message: 'Time slot unblocked successfully',
            data: calendar
        });

    } catch (error) {
        logger.error(`Error in unblockTimeSlot: ${error.message}`);
        next(error);
    }
};