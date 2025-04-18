require('dotenv').config();
const emailService = require('../services/emailService');
const { getCurrentUTC } = require('../utils/dateTime');

const testAppointmentReminder = async () => {
    console.log('Starting appointment reminder test...');

    // Create a test appointment for tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(14, 30, 0, 0); // Set to 2:30 PM

    const appointment = {
        _id: '123456789',
        dateTime: tomorrow,
        status: 'confirmed',
        doctorId: {
            firstName: 'Doctor',
            lastName: 'Test',
            email: process.env.EMAIL_USER
        },
        patientId: {
            firstName: 'Patient',
            lastName: 'Test',
            email: process.env.EMAIL_USER,
            phone: '+94 77 123 4567'
        },
        location: 'Main Clinic',
        description: 'Regular checkup'
    };

    try {
        console.log('Sending reminder email to patient...');
        const patientResult = await emailService.sendAppointmentReminder(
            appointment,
            appointment.patientId,
            'patient'
        );
        console.log('Patient reminder email result:', patientResult);

        // Wait a bit before sending the second email
        await new Promise(resolve => setTimeout(resolve, 1000));

        console.log('Sending reminder email to doctor...');
        const doctorResult = await emailService.sendAppointmentReminder(
            appointment,
            appointment.doctorId,
            'doctor'
        );
        console.log('Doctor reminder email result:', doctorResult);

    } catch (error) {
        console.error('Error in test execution:', error);
    }
};

// Run the test
console.log('Starting test execution...');
testAppointmentReminder().then(() => {
    console.log('Test execution completed');
}).catch(error => {
    console.error('Test execution failed:', error);
});