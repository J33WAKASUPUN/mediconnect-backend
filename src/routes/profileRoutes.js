const express = require('express');
const router = express.Router();
const {
    getProfile,
    updateProfile,
    updatePatientProfile,
    updateDoctorProfile
} = require('../controllers/profileController');
const { protect } = require('../middleware/auth');
const { uploadProfilePicture } = require('../middleware/upload');

// Protect all routes
router.use(protect);

// Profile routes
router.get('/', getProfile);
router.put('/', uploadProfilePicture, updateProfile);
router.put('/patient', updatePatientProfile);
router.put('/doctor', updateDoctorProfile);

module.exports = router;