require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const connectDB = require('./src/config/db');
const { errorHandler } = require('./src/middleware/error');
const logger = require('./src/utils/logger');
const { getCurrentUTC } = require('./src/utils/dateTime');
const CronService = require('./src/services/cronService');
const testRoutes = require('./src/routes/testRoutes');
const paymentRoutes = require('./src/routes/paymentRoutes')

// Initialize express
const app = express();
CronService.initializeJobs();

// Connect to database
connectDB();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Static folder
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Test routes - should be before other routes to avoid auth middleware
if (process.env.NODE_ENV === 'development') {
    app.use('/api/test', testRoutes);
}

// Routes
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/profile', require('./src/routes/profileRoutes'));
app.use('/api/appointments', require('./src/routes/appointmentRoutes'));
app.use('/api/availability', require('./src/routes/availabilityRoutes'));
app.use('/api/notifications', require('./src/routes/notificationRoutes'));
app.use('/api/reviews', require('./src/routes/reviewRoutes'));
app.use('/api/medical-records', require('./src/routes/medicalRecordRoutes'));
app.use('/api/calendar', require('./src/routes/calendarRoutes'));
app.use('/api/payments', paymentRoutes);

// Error handler
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, '0.0.0.0', () => {
    logger.info(`Server running on ${process.env.BASE_URL} in ${process.env.NODE_ENV} mode\n timestamp: ${getCurrentUTC()}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    logger.error(`Error: ${err.message}\n timestamp: ${getCurrentUTC()}`);
    server.close(() => process.exit(1));
});

module.exports = app;