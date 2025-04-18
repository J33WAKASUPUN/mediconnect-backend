const express = require('express');
const router = express.Router();
const emailService = require('../services/emailService');
const { getCurrentUTC } = require('../utils/dateTime');

// Test email endpoint
router.post('/email', async (req, res) => {
    try {
        console.log('Starting email test at:', getCurrentUTC());
        
        // Test data
        const testAppointment = {
            dateTime: new Date(),
            duration: 30,
            status: 'pending',
            reasonForVisit: 'Test Appointment',
            doctorId: {
                firstName: 'John',
                lastName: 'Doe',
                email: process.env.EMAIL_USER
            },
            patientId: {
                firstName: 'Jane',
                lastName: 'Smith',
                email: process.env.EMAIL_USER
            }
        };

        console.log('Test appointment data:', JSON.stringify(testAppointment, null, 2));

        // Test patient email
        console.log('Sending patient test email...');
        const patientResult = await emailService.sendAppointmentConfirmation(
            testAppointment,
            { email: process.env.EMAIL_USER },
            'patient'
        );

        // Test doctor email
        console.log('Sending doctor test email...');
        const doctorResult = await emailService.sendAppointmentConfirmation(
            testAppointment,
            { email: process.env.EMAIL_USER },
            'doctor'
        );

        console.log('Email test results:', { patient: patientResult, doctor: doctorResult });

        res.json({
            success: true,
            timestamp: getCurrentUTC(),
            message: 'Test emails sent successfully',
            results: {
                patient: patientResult,
                doctor: doctorResult
            }
        });
    } catch (error) {
        console.error('Test email error:', error);
        res.status(500).json({
            success: false,
            timestamp: getCurrentUTC(),
            message: 'Failed to send test emails',
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

module.exports = router;