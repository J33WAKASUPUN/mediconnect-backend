const Notification = require('../models/Notification');
const { getCurrentUTC } = require('../utils/dateTime');


// @desc    Get user notifications
// @route   GET /api/notifications
// @access  Private
exports.getNotifications = async (req, res, next) => {
    try {
        const notifications = await Notification.find({ userId: req.user.id })
            .sort({ createdAt: -1 })
            .limit(50);

        res.status(200).json({
            success: true,
            timestamp: getCurrentUTC(),
            data: notifications
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Mark notification as read
// @route   PUT /api/notifications/:id
// @access  Private
exports.markAsRead = async (req, res, next) => {
    try {
        const notification = await Notification.findOneAndUpdate(
            { _id: req.params.id, userId: req.user.id },
            { isRead: true },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Notification not found'
            });
        }

        res.status(200).json({
            success: true,
            timestamp: getCurrentUTC(),
            data: notification
        });
    } catch (error) {
        next(error);
    }
};