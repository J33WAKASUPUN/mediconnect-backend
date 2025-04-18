// src/routes/notificationRoutes.js
const express = require('express');
const router = express.Router();
const {
    getNotifications,
    markAsRead
} = require('../controllers/notificationController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/', getNotifications);
router.put('/:id', markAsRead);

module.exports = router;