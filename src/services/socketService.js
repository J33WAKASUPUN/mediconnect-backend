const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

let io;

// Initialize Socket.IO server
exports.initializeSocketServer = (server) => {
    io = socketIo(server, {
        cors: {
            origin: process.env.CLIENT_URL || "*",
            methods: ["GET", "POST", "PUT", "DELETE"],
            credentials: true
        }
    });

    // Socket middleware for authentication
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth.token;
            
            if (!token) {
                return next(new Error('Authentication error: Token not provided'));
            }
            
            // Verify token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            
            // Get user from database
            const user = await User.findById(decoded.id);
            
            if (!user) {
                return next(new Error('Authentication error: User not found'));
            }
            
            // Attach user data to socket
            socket.user = {
                id: user._id.toString(),
                role: user.role
            };
            
            next();
        } catch (error) {
            logger.error(`Socket authentication error: ${error.message}`);
            next(new Error('Authentication error: Invalid token'));
        }
    });

    // Connection handler
    io.on('connection', (socket) => {
        const userId = socket.user.id;
        
        logger.info(`User connected: ${userId}`);
        
        // Join a room with the user's ID
        socket.join(userId);
        
        // Handle joining a conversation room
        socket.on('joinConversation', (conversationId) => {
            socket.join(`conversation:${conversationId}`);
            logger.info(`User ${userId} joined conversation: ${conversationId}`);
        });
        
        // Handle leaving a conversation room
        socket.on('leaveConversation', (conversationId) => {
            socket.leave(`conversation:${conversationId}`);
            logger.info(`User ${userId} left conversation: ${conversationId}`);
        });
        
        // Handle disconnection
        socket.on('disconnect', () => {
            logger.info(`User disconnected: ${userId}`);
        });
    });

    logger.info('Socket.IO server initialized');
    return io;
};

// Get Socket.IO instance
exports.getIo = () => {
    if (!io) {
        throw new Error('Socket.IO not initialized');
    }
    return io;
};

// Export io for use in other modules
exports.io = io;