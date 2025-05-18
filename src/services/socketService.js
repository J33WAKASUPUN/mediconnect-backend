const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

let io;

// Initialize Socket.IO server
exports.initializeSocketServer = (server) => {
    console.log('Socket.IO initialization started');
    
    // Initialize with CORS settings
    io = socketIo(server, {
        cors: {
            origin: process.env.CLIENT_URL || "*",
            methods: ["GET", "POST", "PUT", "DELETE"],
            credentials: true
        }
    });
    console.log(`Socket.IO server created with CORS settings: origin=${process.env.CLIENT_URL || "*"}`);

    // Debug engine errors
    io.engine.on("connection_error", (err) => {
        console.log("Socket.IO Engine Connection Error:", {
            req: err.req ? `${err.req.method} ${err.req.url}` : 'No request data',
            code: err.code,
            message: err.message,
            context: err.context
        });
        logger.error(`Socket.IO Engine Error: ${err.code} - ${err.message}`);
    });

    // Socket middleware for authentication
    console.log('Setting up Socket.IO authentication middleware');
    io.use(async (socket, next) => {
        try {
            console.log('Socket connection attempt from:', socket.handshake.address);
            console.log('Socket handshake headers:', JSON.stringify(socket.handshake.headers));
            
            // Check auth object
            console.log('Socket auth data:', JSON.stringify(socket.handshake.auth));
            const token = socket.handshake.auth.token;
            
            // Try to get token from multiple places if not found in auth
            if (!token) {
                console.log('Token not found in auth object, checking headers');
                const authHeader = socket.handshake.headers.authorization;
                if (authHeader && authHeader.startsWith('Bearer ')) {
                    const headerToken = authHeader.split(' ')[1];
                    console.log('Found token in Authorization header');
                    socket.handshake.auth.token = headerToken;
                    socket.token = headerToken;
                } else {
                    console.log('No token found in Authorization header either');
                    return next(new Error('Authentication error: Token not provided'));
                }
            } else {
                console.log('Token found in auth object');
                socket.token = token;
            }
            
            // Display partial token for debugging
            const displayToken = socket.token ? 
                `${socket.token.substring(0, 10)}...${socket.token.substring(token.length - 5)}` : 
                'undefined';
            console.log(`Validating token: ${displayToken}`);
            
            // Verify token
            const decoded = jwt.verify(socket.token, process.env.JWT_SECRET);
            console.log(`Token decoded successfully for user ID: ${decoded.id}`);
            
            // Get user from database
            const user = await User.findById(decoded.id);
            
            if (!user) {
                console.log(`User not found for ID: ${decoded.id}`);
                return next(new Error('Authentication error: User not found'));
            }
            
            console.log(`User found: ${user._id} (${user.role})`);
            
            // Attach user data to socket
            socket.user = {
                id: user._id.toString(),
                role: user.role
            };
            
            console.log(`Socket authenticated for user: ${socket.user.id}`);
            next();
        } catch (error) {
            console.log(`Socket authentication failed: ${error.message}`, error);
            logger.error(`Socket authentication error: ${error.message}`);
            next(new Error(`Authentication error: ${error.message}`));
        }
    });

    // Connection handler
    console.log('Setting up Socket.IO connection handler');
    io.on('connection', (socket) => {
        const userId = socket.user?.id;
        
        if (userId) {
            console.log(`Socket connected: ${socket.id} for user: ${userId}`);
            logger.info(`User connected: ${userId}`);
            
            // Join a room with the user's ID
            socket.join(userId);
            console.log(`User ${userId} joined their user room`);
            
            // Emit welcome event to verify connection to client
            socket.emit('welcome', { message: 'Successfully connected to socket server' });
            
            // Handle joining a conversation room
            socket.on('joinConversation', (conversationId) => {
                console.log(`Received joinConversation event for conversation: ${conversationId}`);
                
                if (!conversationId) {
                    console.log('Invalid conversationId received');
                    return;
                }
                
                const roomName = `conversation:${conversationId}`;
                socket.join(roomName);
                console.log(`User ${userId} joined room: ${roomName}`);
                logger.info(`User ${userId} joined conversation: ${conversationId}`);
                
                // Emit confirmation back to client
                socket.emit('joinedConversation', { 
                    conversationId: conversationId,
                    success: true 
                });
            });
            
            // Handle leaving a conversation room
            socket.on('leaveConversation', (conversationId) => {
                console.log(`Received leaveConversation event for conversation: ${conversationId}`);
                
                if (!conversationId) {
                    console.log('Invalid conversationId received');
                    return;
                }
                
                const roomName = `conversation:${conversationId}`;
                socket.leave(roomName);
                console.log(`User ${userId} left room: ${roomName}`);
                logger.info(`User ${userId} left conversation: ${conversationId}`);
                
                // Emit confirmation back to client
                socket.emit('leftConversation', { 
                    conversationId: conversationId,
                    success: true 
                });
            });
            
            // Handle typing status
            socket.on('typing', (data) => {
                console.log(`Received typing event from ${userId}:`, data);
                
                const { conversationId, isTyping } = data;
                
                if (!conversationId) {
                    console.log('Invalid conversationId in typing event');
                    return;
                }
                
                // Find participants in this conversation and emit to the other user
                const roomName = `conversation:${conversationId}`;
                console.log(`Broadcasting userTyping event to room: ${roomName}`);
                
                socket.to(roomName).emit('userTyping', {
                    userId,
                    isTyping
                });
            });
            
            // Debug: Log all events received from this socket
            socket.onAny((event, ...args) => {
                console.log(`Socket ${socket.id} event: ${event}`, args);
            });
        } else {
            console.log(`Socket connected without user data: ${socket.id}`);
        }
        
        // Handle disconnection
        socket.on('disconnect', (reason) => {
            if (userId) {
                console.log(`User ${userId} disconnected from socket ${socket.id}. Reason: ${reason}`);
                logger.info(`User disconnected: ${userId}. Reason: ${reason}`);
            } else {
                console.log(`Anonymous socket ${socket.id} disconnected. Reason: ${reason}`);
            }
        });
        
        // Handle errors
        socket.on('error', (error) => {
            console.log(`Socket ${socket.id} error:`, error);
            logger.error(`Socket error for ${userId || 'anonymous'}: ${error}`);
        });
    });

    // Set the exported io object
    exports.io = io;
    
    logger.info('Socket.IO server initialized');
    console.log('Socket.IO server initialization complete');
    return io;
};

// Get Socket.IO instance
exports.getIo = () => {
    if (!io) {
        console.log('Socket.IO not initialized when getIo was called');
        throw new Error('Socket.IO not initialized');
    }
    return io;
};

// Utility function to emit to all clients in a conversation
exports.emitToConversation = (conversationId, event, data) => {
    if (!io) {
        console.log('Socket.IO not initialized when emitToConversation was called');
        throw new Error('Socket.IO not initialized');
    }
    
    const roomName = `conversation:${conversationId}`;
    console.log(`Emitting ${event} to room ${roomName}:`, data);
    io.to(roomName).emit(event, data);
};

// Utility function to emit to a specific user
exports.emitToUser = (userId, event, data) => {
    if (!io) {
        console.log('Socket.IO not initialized when emitToUser was called');
        throw new Error('Socket.IO not initialized');
    }
    
    console.log(`Emitting ${event} to user ${userId}:`, data);
    io.to(userId).emit(event, data);
};

// Initial value is null, will be set during initialization
exports.io = null;

console.log('Socket service module loaded');