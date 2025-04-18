const express = require('express');
const router = express.Router();
const {
    setDefaultWorkingHours,
    getCalendar,
    updateDateSchedule,
    blockTimeSlot,
    getAvailableSlots,
    unblockTimeSlot  // Add this import
} = require('../controllers/calendarController');
const { protect, authorize } = require('../middleware/auth');

// Protected routes
router.use(protect);

// Doctor only routes
router.post('/working-hours', authorize('doctor'), setDefaultWorkingHours);
router.put('/date/:date', authorize('doctor'), updateDateSchedule);
router.post('/block-slot', authorize('doctor'), blockTimeSlot);
router.delete('/block-slot/:date/:slotId', authorize('doctor'), unblockTimeSlot);

// Routes accessible by both doctors and patients
router.get('/:doctorId', getCalendar);
router.get('/available-slots/:doctorId/:date', getAvailableSlots);

module.exports = router;