const logger = require('../utils/logger');
const { getCurrentUTC } = require('../utils/dateTime');

exports.errorHandler = (err, req, res, next) => {
    logger.error(err.stack);

    const error = { ...err };
    error.message = err.message;

    // Mongoose duplicate key
    if (err.code === 11000) {
        error.message = 'Duplicate field value entered';
        error.statusCode = 400;
    }

    // Mongoose validation error
    if (err.name === 'ValidationError') {
        error.message = Object.values(err.errors).map(val => val.message);
        error.statusCode = 400;
    }

    res.status(error.statusCode || 500).json({
        success: false,
        timestamp: getCurrentUTC(), // 2025-03-07 16:22:29
        message: error.message || 'Server Error'
    });
};