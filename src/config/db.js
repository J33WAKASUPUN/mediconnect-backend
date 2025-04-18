const mongoose = require('mongoose');
const logger = require('../utils/logger');
const { getCurrentUTC } = require('../utils/dateTime');

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI, {
            // MongoDB connection options
        });

        logger.info(`MongoDB Connected Successfully\n timestamp: ${getCurrentUTC()}`);
        return conn;
    } catch (error) {
        logger.error(`Error: ${error.message}\n timestamp: ${getCurrentUTC()}`);
        process.exit(1);
    }
};

module.exports = connectDB;