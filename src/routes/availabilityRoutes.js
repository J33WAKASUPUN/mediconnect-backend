// src/routes/availabilityRoutes.js
const express = require('express');
const router = express.Router();
const {
    getAvailableSlots,
    updateAvailability
} = require('../controllers/availabilityController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/:doctorId', getAvailableSlots);
router.put('/', updateAvailability);

module.exports = router;