require('dotenv').config(); // Add this line at the top
const emailService = require('../services/emailService');

const testScheduleUpdateEmail = async () => {
    console.log('Starting email test...');
    console.log('Email configuration:');
    console.log('EMAIL_USER:', process.env.EMAIL_USER);
    console.log('EMAIL_PASS exists:', !!process.env.EMAIL_PASS);

    const doctor = {
        firstName: 'Doctor 1',
        lastName: 'Test',
        email: process.env.EMAIL_USER // Send to yourself for testing
    };

    const updatedSlots = [
        {
            startTime: '09:00',
            endTime: '10:00',
            isBlocked: false
        },
        {
            startTime: '10:00',
            endTime: '11:00',
            isBlocked: true,
            reason: 'Personal appointment'
        },
        {
            startTime: '14:00',
            endTime: '15:00',
            isBlocked: false
        }
    ];

    const date = '2025-04-03';

    try {
        console.log('Attempting to send test email...');
        const result = await emailService.sendScheduleUpdate(
            doctor,
            updatedSlots,
            date
        );
        console.log('Email send attempt completed. Result:', result);
    } catch (error) {
        console.error('Error in test execution:', error);
    }
};

// Run the test
console.log('Starting test execution...');
testScheduleUpdateEmail().then(() => {
    console.log('Test execution completed');
}).catch(error => {
    console.error('Test execution failed:', error);
});