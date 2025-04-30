const express = require('express');
const router = express.Router();
const {
    getProfile,
    updateProfile,
    updatePatientProfile,
    updateDoctorProfile,
    getUserById
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
router.get('/users/:id', getUserById);  


module.exports = router;