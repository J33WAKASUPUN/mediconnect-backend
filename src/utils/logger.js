const winston = require('winston');
const { getCurrentUTC } = require('./dateTime');

const logger = winston.createLogger({
    format: winston.format.combine(
        winston.format.printf(info => {
            const timestamp = getCurrentUTC(); // 2025-03-07 16:20:01
            return `${timestamp} ${info.level}: ${info.message}`;
        })
    ),
    transports: [
        new winston.transports.Console({
            level: process.env.NODE_ENV === 'production' ? 'error' : 'info'
        }),
        new winston.transports.File({ 
            filename: 'logs/error.log', 
            level: 'error' 
        }),
        new winston.transports.File({ 
            filename: 'logs/combined.log' 
        })
    ]
});

module.exports = logger;