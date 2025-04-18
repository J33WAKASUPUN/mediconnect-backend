require('dotenv').config();
const emailService = require('../services/emailService');
const { getCurrentUTC } = require('../utils/dateTime');

const testAppointmentConfirmation = async () => {
    console.log('Starting appointment confirmation email test...');

    const appointment = {
        _id: '123456789',
        dateTime: new Date('2025-04-03T14:00:00Z'),
        status: 'pending',
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
        console.log('Sending confirmation email to patient...');
        const patientResult = await emailService.sendAppointmentConfirmation(
            appointment,
            appointment.patientId,
            'patient'
        );
        console.log('Patient email result:', patientResult);

        // Wait a bit before sending the second email
        await new Promise(resolve => setTimeout(resolve, 1000));

        console.log('Sending notification email to doctor...');
        const doctorResult = await emailService.sendAppointmentConfirmation(
            appointment,
            appointment.doctorId,
            'doctor'
        );
        console.log('Doctor email result:', doctorResult);

    } catch (error) {
        console.error('Error in test execution:', error);
    }
};

// Run the test
console.log('Starting test execution...');
testAppointmentConfirmation().then(() => {
    console.log('Test execution completed');
}).catch(error => {
    console.error('Test execution failed:', error);
});