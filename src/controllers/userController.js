const User = require('../models/User');
const { getCurrentUTC } = require('../utils/dateTime');

// @desc    Get all users by role
// @route   GET /api/auth/users
// @access  Private
exports.getUsersByRole = async (req, res, next) => {
    try {
        const { role } = req.query;
        
        // Build query
        const query = role ? { role } : {};

        // Get users
        const users = await User.find(query)
            .select('-password')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            timestamp: getCurrentUTC(),
            count: users.length,
            data: users
        });
    } catch (error) {
        next(error);
    }
};