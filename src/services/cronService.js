// src/services/cronService.js
const cron = require('node-cron');
const Appointment = require('../models/Appointment');
const NotificationService = require('./notificationService');
const { getCurrentUTC } = require('../utils/dateTime');

class CronService {
    static initializeJobs() {
        // Check for no-shows every hour
        cron.schedule('0 * * * *', async () => {
            const thirtyMinutesAgo = new Date(Date.now() - 30 * 60000);
            
            const missedAppointments = await Appointment.find({
                status: 'confirmed',
                dateTime: { $lt: thirtyMinutesAgo }
            }).populate('doctorId patientId');

            for (const appointment of missedAppointments) {
                appointment.status = 'no_show';
                await appointment.save();

                await NotificationService.createAppointmentNotifications(
                    appointment,
                    'appointment_missed',
                    `${appointment.doctorId.firstName} ${appointment.doctorId.lastName}`,
                    `${appointment.patientId.firstName} ${appointment.patientId.lastName}`
                );
            }
        });

        // Send appointment reminders daily at 8 AM
        cron.schedule('0 8 * * *', async () => {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            
            const appointments = await Appointment.find({
                status: 'confirmed',
                dateTime: {
                    $gte: tomorrow,
                    $lt: new Date(tomorrow.getTime() + 24 * 60 * 60000)
                }
            }).populate('doctorId patientId');

            for (const appointment of appointments) {
                await NotificationService.createAppointmentNotifications(
                    appointment,
                    'appointment_reminder',
                    `${appointment.doctorId.firstName} ${appointment.doctorId.lastName}`,
                    `${appointment.patientId.firstName} ${appointment.patientId.lastName}`
                );
            }
        });
    }
}

module.exports = CronService;