const HealthSession = require('../models/HealthSession');
const HealthMessage = require('../models/HealthMessage');
const openAIService = require('../services/openAIService');
const logger = require('../utils/logger');
const { getCurrentUTC } = require('../utils/dateTime');
const fs = require('fs').promises;
const path = require('path');

// Create a new health conversation session
exports.createSession = async (req, res, next) => {
  try {
    const { userType = 'patient' } = req.body;

    // Use the authenticated user's ID
    const userId = req.user.id;

    const session = new HealthSession({
      userId,
      userType,
      title: 'New Health Conversation'
    });

    await session.save();

    logger.info(`Health session created for user ${userId} at ${getCurrentUTC()}`);

    res.status(201).json({
      success: true,
      timestamp: getCurrentUTC(),
      data: session
    });
  } catch (error) {
    logger.error(`Error creating health session: ${error.message} at ${getCurrentUTC()}`);
    next(error);
  }
};

// Get all health conversation sessions for a user
exports.getSessions = async (req, res, next) => {
  try {
    // Use the authenticated user's ID
    const userId = req.user.id;

    const sessions = await HealthSession.find({ userId, isActive: true })
      .sort({ updatedAt: -1 })
      .select('_id title userType createdAt updatedAt lastMessagePreview');

    res.status(200).json({
      success: true,
      timestamp: getCurrentUTC(),
      count: sessions.length,
      data: sessions
    });
  } catch (error) {
    logger.error(`Error getting health sessions: ${error.message} at ${getCurrentUTC()}`);
    next(error);
  }
};

// Get a specific health conversation session with messages
exports.getSession = async (req, res, next) => {
  try {
    const { id } = req.params;

    const session = await HealthSession.findById(id);

    // Check if session exists
    if (!session) {
      return res.status(404).json({
        success: false,
        timestamp: getCurrentUTC(),
        message: 'Health session not found'
      });
    }

    // Check if user owns this session
    if (session.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        timestamp: getCurrentUTC(),
        message: 'Not authorized to access this session'
      });
    }

    // Get messages for this session
    const messages = await HealthMessage.find({ sessionId: id })
      .sort({ createdAt: 1 });

    res.status(200).json({
      success: true,
      timestamp: getCurrentUTC(),
      data: {
        session,
        messages
      }
    });
  } catch (error) {
    logger.error(`Error getting health session: ${error.message} at ${getCurrentUTC()}`);
    next(error);
  }
};

// Delete (soft delete) a health conversation session
exports.deleteSession = async (req, res, next) => {
  try {
    const { id } = req.params;

    const session = await HealthSession.findById(id);

    // Check if session exists
    if (!session) {
      return res.status(404).json({
        success: false,
        timestamp: getCurrentUTC(),
        message: 'Health session not found'
      });
    }

    // Check if user owns this session
    if (session.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        timestamp: getCurrentUTC(),
        message: 'Not authorized to delete this session'
      });
    }

    // Soft delete by marking as inactive
    session.isActive = false;
    session.updatedAt = getCurrentUTC();
    await session.save();

    logger.info(`Health session ${id} soft deleted at ${getCurrentUTC()}`);

    res.status(200).json({
      success: true,
      timestamp: getCurrentUTC(),
      message: 'Health session deleted successfully'
    });
  } catch (error) {
    logger.error(`Error deleting health session: ${error.message} at ${getCurrentUTC()}`);
    next(error);
  }
};

// Send a message and get AI response
exports.sendMessage = async (req, res, next) => {
  try {
    const { sessionId, content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({
        success: false,
        timestamp: getCurrentUTC(),
        message: 'Message content cannot be empty'
      });
    }

    // Find the session
    const session = await HealthSession.findById(sessionId);

    // Check if session exists
    if (!session) {
      return res.status(404).json({
        success: false,
        timestamp: getCurrentUTC(),
        message: 'Health session not found'
      });
    }

    // Check if user owns this session
    if (session.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        timestamp: getCurrentUTC(),
        message: 'Not authorized to access this session'
      });
    }

    // Update session title if it's the first message
    await session.updateTitleFromMessage(content);

    // Save user message to database
    const userMessage = new HealthMessage({
      sessionId,
      role: 'user',
      content,
      createdAt: getCurrentUTC()
    });

    await userMessage.save();

    // Update session with last message preview
    await session.updateLastMessage(content);

    // Get previous messages for context (limit to last 10 for token efficiency)
    const previousMessages = await HealthMessage.find({ sessionId })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // Format messages for OpenAI
    const conversationHistory = previousMessages
      .reverse() // Chronological order
      .filter(msg => msg.role !== 'system'); // Remove any system messages

    // Send to OpenAI with user type from session
    const aiResponse = await openAIService.healthChat(content, session.userType, conversationHistory);

    // Save AI response to database
    const assistantMessage = new HealthMessage({
      sessionId,
      role: 'assistant',
      content: aiResponse.content,
      tokenUsage: aiResponse.usage,
      createdAt: getCurrentUTC()
    });

    await assistantMessage.save();

    // Update session with AI response preview
    await session.updateLastMessage(aiResponse.content);

    // Emit socket event if socket service is available
    try {
      const io = require('../../server').io;
      if (io) {
        io.to(req.user.id).emit('health-insight-message', {
          sessionId,
          message: assistantMessage
        });
      }
    } catch (socketError) {
      logger.warn(`Socket emit failed: ${socketError.message} at ${getCurrentUTC()}`);
      // Continue execution even if socket fails
    }

    res.status(200).json({
      success: true,
      timestamp: getCurrentUTC(),
      data: {
        userMessage,
        assistantMessage,
        usage: aiResponse.usage
      }
    });
  } catch (error) {
    logger.error(`Error sending health message: ${error.message} at ${getCurrentUTC()}`);
    next(error);
  }
};

// Analyze a medical document
exports.analyzeDocument = async (req, res, next) => {
  try {
    const { text, documentType = 'general' } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({
        success: false,
        timestamp: getCurrentUTC(),
        message: 'Document text cannot be empty'
      });
    }

    const analysis = await openAIService.analyzeDocument(text, documentType);

    res.status(200).json({
      success: true,
      timestamp: getCurrentUTC(),
      data: analysis
    });
  } catch (error) {
    logger.error(`Error analyzing document: ${error.message} at ${getCurrentUTC()}`);
    next(error);
  }
};

// Get sample health topics for new users
exports.getSampleTopics = async (req, res, next) => {
  try {
    const userRole = req.user.role;

    let sampleTopics;

    if (userRole === 'patient') {
      sampleTopics = [
        "What are the symptoms of seasonal allergies?",
        "How can I improve my sleep habits?",
        "What are the recommended vaccinations for adults?",
        "What's the difference between a cold and the flu?",
        "How can I maintain a heart-healthy diet?",
        "What are the warning signs of diabetes?",
        "How often should I get an eye exam?",
        "What exercises are best for back pain?",
        "How can I manage stress effectively?",
        "What are common triggers for migraines?"
      ];
    } else {
      // Topics for healthcare professionals
      sampleTopics = [
        "Latest treatment guidelines for type 2 diabetes",
        "Evidence for SGLT-2 inhibitors in heart failure",
        "Current antibiotic resistance patterns",
        "Updates on COVID-19 treatment protocols",
        "Management of treatment-resistant depression",
        "Latest research on alzheimer's disease",
        "Differential diagnosis for chronic fatigue",
        "Current hypertension management guidelines",
        "Interpretation of abnormal liver function tests",
        "Management of fibromyalgia pain"
      ];
    }

    res.status(200).json({
      success: true,
      timestamp: getCurrentUTC(),
      data: sampleTopics
    });
  } catch (error) {
    logger.error(`Error getting sample topics: ${error.message} at ${getCurrentUTC()}`);
    next(error);
  }
};


// Process a large document in chunks
exports.analyzeDocumentInChunks = async (req, res, next) => {
  try {
    const { text, documentType = 'general' } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({
        success: false,
        timestamp: getCurrentUTC(),
        message: 'Document text cannot be empty'
      });
    }

    // Split document into manageable chunks (about 2000 chars each)
    const chunkSize = 2000;
    const chunks = [];
    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.substring(i, i + chunkSize));
    }

    logger.info(`Processing document in ${chunks.length} chunks at ${getCurrentUTC()}`);

    // Process each chunk
    const results = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunkResult = await openAIService.analyzeDocument(
        `[PART ${i + 1} OF ${chunks.length}]: ${chunks[i]}`,
        documentType
      );
      results.push(chunkResult.content);
    }

    // If there are multiple chunks, do a final summary
    let finalResult;
    if (results.length > 1) {
      const summary = await openAIService.generateResponse([
        {
          role: "system",
          content: "Create a cohesive summary from these document analysis parts."
        },
        {
          role: "user",
          content: `These are analyses of parts of a ${documentType}. Please synthesize into one cohesive analysis:\n\n${results.join('\n\n')}`
        }
      ], 0.3, 1000);

      finalResult = summary.content;
    } else {
      finalResult = results[0];
    }

    res.status(200).json({
      success: true,
      timestamp: getCurrentUTC(),
      data: {
        analysis: finalResult,
        chunks: chunks.length
      }
    });
  } catch (error) {
    logger.error(`Error analyzing document in chunks: ${error.message} at ${getCurrentUTC()}`);
    next(error);
  }
};

// Analyze a medical image (UPDATED)
exports.analyzeImage = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        timestamp: getCurrentUTC(),
        message: 'Please upload an image'
      });
    }

    // Get sessionId and prompt
    const { sessionId, prompt } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        timestamp: getCurrentUTC(),
        message: 'Session ID is required'
      });
    }

    // Find the session
    const session = await HealthSession.findById(sessionId);

    // Check if session exists
    if (!session) {
      return res.status(404).json({
        success: false,
        timestamp: getCurrentUTC(),
        message: 'Health session not found'
      });
    }

    // Check if user owns this session
    if (session.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        timestamp: getCurrentUTC(),
        message: 'Not authorized to access this session'
      });
    }

    // Read the uploaded file
    const imageBuffer = await fs.readFile(req.file.path);

    // First, SAVE THE USER'S PROMPT AS A MESSAGE
    const userPrompt = prompt || 'What can you tell me about this medical image?';

    const userMessage = new HealthMessage({
      sessionId,
      role: 'user',
      content: userPrompt,
      createdAt: getCurrentUTC()
    });

    await userMessage.save();

    // Update session title if it's the first message
    await session.updateTitleFromMessage(userPrompt);

    // Update session with last message preview
    await session.updateLastMessage(userPrompt);

    // Send to OpenAI for analysis
    const analysis = await openAIService.analyzeImage(imageBuffer, prompt);

    // Build a rich content message that includes both the analysis and image URL
    const imageUrl = `${process.env.BASE_URL}/${req.file.path.replace(/\\/g, '/')}`;
    const contentWithImage = `
![Medical image analysis](${imageUrl})

${analysis.content}
    `.trim();

    // Save AI response to database
    const assistantMessage = new HealthMessage({
      sessionId,
      role: 'assistant',
      content: contentWithImage,
      tokenUsage: analysis.usage,
      createdAt: getCurrentUTC()
    });

    await assistantMessage.save();

    // Update session with AI response preview
    await session.updateLastMessage(analysis.content);

    // Emit socket event if socket service is available
    try {
      const io = require('../../server').io;
      if (io) {
        // EMIT BOTH MESSAGES, FIRST THE USER MESSAGE
        io.to(req.user.id).emit('health-insight-message', {
          sessionId,
          message: userMessage
        });

        // THEN THE ASSISTANT'S RESPONSE
        io.to(req.user.id).emit('health-insight-message', {
          sessionId,
          message: assistantMessage
        });
      }
    } catch (socketError) {
      logger.warn(`Socket emit failed: ${socketError.message} at ${getCurrentUTC()}`);
    }

    res.status(200).json({
      success: true,
      timestamp: getCurrentUTC(),
      data: {
        analysis: analysis.content,
        imageUrl: imageUrl,
        usage: analysis.usage,
        userMessage: userMessage, // INCLUDE USER MESSAGE IN RESPONSE
        assistantMessage: assistantMessage
      }
    });
  } catch (error) {
    logger.error(`Error analyzing image: ${error.message} at ${getCurrentUTC()}`);
    next(error);
  }
};

// Analyze a document with optional image
exports.analyzeDocumentWithImage = async (req, res, next) => {
  try {
    const { text } = req.body;

    if (!text && !req.file) {
      return res.status(400).json({
        success: false,
        timestamp: getCurrentUTC(),
        message: 'Please provide document text or upload an image'
      });
    }

    let imageBuffer = null;

    // If image is provided
    if (req.file) {
      imageBuffer = await fs.readFile(req.file.path);
    }

    // Send to OpenAI for analysis
    const analysis = await openAIService.analyzeDocumentWithImage(text || '', imageBuffer);

    res.status(200).json({
      success: true,
      timestamp: getCurrentUTC(),
      data: {
        analysis: analysis.content,
        imageUrl: req.file ? `${process.env.BASE_URL}/${req.file.path.replace(/\\/g, '/')}` : null,
        usage: analysis.usage
      }
    });
  } catch (error) {
    logger.error(`Error analyzing document with image: ${error.message} at ${getCurrentUTC()}`);
    next(error);
  }
};