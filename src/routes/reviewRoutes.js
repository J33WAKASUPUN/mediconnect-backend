const express = require('express');
const router = express.Router();
const {
    createReview,
    getDoctorReviews,
    addDoctorResponse,
    getDoctorReviewAnalytics
} = require('../controllers/reviewController');
const { protect } = require('../middleware/auth');

// Public route
router.get('/doctor/:doctorId', getDoctorReviews);

// Protected routes
router.use(protect);
router.post('/:appointmentId', createReview);
router.put('/:reviewId/response', addDoctorResponse);
router.get('/doctor/:doctorId/analytics', getDoctorReviewAnalytics);

module.exports = router;