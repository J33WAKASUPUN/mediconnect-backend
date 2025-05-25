const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');
const { getCurrentUTC } = require('../utils/dateTime');

// Regular chat message rate limit
const chatRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 chat requests per minute per IP
  message: {
    success: false,
    timestamp: getCurrentUTC(),
    message: 'Too many chat requests. Please try again in a minute.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    logger.warn(`Chat rate limit exceeded: ${req.ip} at ${getCurrentUTC()}`);
    res.status(429).json(options.message);
  }
});

// Document analysis rate limit (more restrictive)
const documentRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5, // 5 document analyses per 5 minutes per IP
  message: {
    success: false,
    timestamp: getCurrentUTC(),
    message: 'Document analysis limit reached. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    logger.warn(`Document analysis rate limit exceeded: ${req.ip} at ${getCurrentUTC()}`);
    res.status(429).json(options.message);
  }
});

module.exports = {
  chatRateLimit,
  documentRateLimit
};