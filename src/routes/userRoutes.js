// userRoutes.js
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { protect } = require('../middleware/auth');

// Get all users by role
router.get('/', protect, userController.getUsersByRole);

// Get patients who have messaged the doctor
router.get('/patients/messaged', protect, userController.getPatientsWhoMessaged);

module.exports = router;