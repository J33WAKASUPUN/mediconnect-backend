const express = require('express');
const router = express.Router();
const {
    createAppointment,
    getAppointments,
    updateAppointmentStatus,
    requestReschedule,
    addRating,
    getAppointmentHistory,
    getDoctorSchedule,
    getAppointmentStats
} = require('../controllers/appointmentController');
const { protect } = require('../middleware/auth');

router.use(protect);

// Existing routes
router.route('/')
    .post(createAppointment)
    .get(getAppointments);

router.route('/:id/status')
    .put(updateAppointmentStatus);

router.route('/:id/reschedule')
    .post(requestReschedule);

router.route('/:id/rating')
    .post(addRating);

// New routes
router.get('/history', getAppointmentHistory);
router.get('/schedule', getDoctorSchedule);
router.get('/stats', getAppointmentStats);

module.exports = router;