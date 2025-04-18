const express = require('express');
const router = express.Router();
const { register, login } = require('../controllers/authController');
const { getUsersByRole } = require('../controllers/userController');
const { uploadProfilePicture } = require('../middleware/upload');
const { protect } = require('../middleware/auth');

router.post('/register', uploadProfilePicture, register);
router.post('/login', login);
router.get('/users', protect, getUsersByRole);

module.exports = router;