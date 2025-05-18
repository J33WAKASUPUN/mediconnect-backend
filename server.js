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
const http = require('http');
const socketService = require('./src/services/socketService');

// Initialize express
const app = express();
CronService.initializeJobs();
const server = http.createServer(app);

// Socket testing endpoint
app.get('/api/socket-test', (req, res) => {
  try {
    console.log('Socket test endpoint called');
    const io = socketService.getIo();
    
    // Count connected clients
    let connectedClients = 0;
    if (io && io.sockets) {
      connectedClients = Object.keys(io.sockets.sockets).length;
    }
    
    console.log('Connected socket clients:', connectedClients);
    
    // Get information about rooms
    let rooms = [];
    if (io && io.sockets && io.sockets.adapter && io.sockets.adapter.rooms) {
      rooms = Array.from(io.sockets.adapter.rooms.keys());
    }
    
    console.log('Socket rooms:', rooms);
    
    // Emit a test event to all connected clients
    if (io) {
      io.emit('test', { 
        message: 'This is a test broadcast from the server',
        timestamp: getCurrentUTC()
      });
      console.log('Test event emitted to all clients');
    }
    
    res.json({
      success: true,
      timestamp: getCurrentUTC(),
      socketInitialized: !!io,
      connectedClients,
      rooms,
      message: 'Socket test completed. Check server logs.'
    });
  } catch (error) {
    console.error('Socket test error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

console.log('\n================= INITIALIZING SOCKET.IO =================');
try {
  // Initialize socket service after creating http server
  const io = socketService.initializeSocketServer(server);
  console.log('Socket.IO initialization result:', io ? 'SUCCESS' : 'FAILED');
  exports.io = socketService.getIo();
} catch (error) {
  console.error('Socket.IO initialization error:', error);
  logger.error(`Socket.IO initialization error: ${error.message}`);
}
console.log('==========================================================\n');

// Connect to database
connectDB();

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for development
  crossOriginEmbedderPolicy: false // Disable COEP for development
}));
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
app.use('/api/todos', require('./src/routes/todoRoutes'));
app.use('/api/payments', paymentRoutes);
app.use('/api/messages', require('./src/routes/messageRoutes'));

// Error handler
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    logger.info(`Server running on ${process.env.BASE_URL} in ${process.env.NODE_ENV} mode\n timestamp: ${getCurrentUTC()}`);
    console.log(`Server running on ${process.env.BASE_URL} in ${process.env.NODE_ENV} mode\n timestamp: ${getCurrentUTC()}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    logger.error(`Error: ${err.message}\n timestamp: ${getCurrentUTC()}`);
    console.error(`Unhandled Promise Rejection: ${err.message}\n timestamp: ${getCurrentUTC()}`);
    // Don't exit the server for stability, just log the error
});

module.exports = app;