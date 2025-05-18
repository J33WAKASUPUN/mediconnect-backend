const User = require('../models/User');
const { getCurrentUTC } = require('../utils/dateTime');
const logger = require('../utils/logger');

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res, next) => {
    try {
        const { username, email, password, role, firstName, lastName, phoneNumber, gender, address } = req.body;

        // Create user with profile picture if uploaded
        const user = await User.create({
            username: username.toUpperCase(),
            email,
            password,
            role,
            firstName,
            lastName,
            phoneNumber,
            gender,
            address,
            profilePicture: req.file ? `${process.env.BASE_URL}/uploads/profiles/${req.file.filename}` : null,
            createdAt: getCurrentUTC(), // 2025-03-07 16:22:29
            updatedAt: getCurrentUTC()  // 2025-03-07 16:22:29
        });

        const token = user.getSignedJwtToken();

        res.status(201).json({
            success: true,
            timestamp: getCurrentUTC(), // 2025-03-07 16:22:29
            token,
            user: {
                _id: user._id,
                username: user.username,
                role: user.role,
                profilePicture: user.profilePicture
            }
        });

    } catch (error) {
        next(error);
    }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res, next) => {
    try {
        const { email, password, role } = req.body;

        const user = await User.findOne({ email }).select('+password');

        if (!user || !(await user.matchPassword(password)) || user.role !== role) {
            return res.status(401).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Invalid credentials'
            });
        }

        const token = user.getSignedJwtToken();

        // Return a more complete user object to the client
        res.status(200).json({
            success: true,
            timestamp: getCurrentUTC(),
            token,
            user: {
                _id: user._id,
                id: user._id, // Some parts of your app might expect this format
                username: user.username,
                email: user.email,
                role: user.role,
                firstName: user.firstName,
                lastName: user.lastName,
                profilePicture: user.profilePicture
            }
        });

    } catch (error) {
        next(error);
    }
};