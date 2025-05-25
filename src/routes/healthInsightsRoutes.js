const express = require('express');
const router = express.Router();
const healthInsightsController = require('../controllers/healthInsightsController');
const { protect } = require('../middleware/auth');
const { chatRateLimit, documentRateLimit } = require('../middleware/rateLimit');
const { medicalImageUpload, documentUpload } = require('../middleware/upload');

// Protect all routes
router.use(protect);

// Apply specific rate limiting to each endpoint
router.post('/messages', chatRateLimit, healthInsightsController.sendMessage);
router.post('/analyze-document', documentRateLimit, healthInsightsController.analyzeDocument);

// image analysis endpoints
router.post(
  '/analyze-image', 
  documentRateLimit,
  medicalImageUpload.single('image'), 
  healthInsightsController.analyzeImage
);

router.post(
  '/analyze-document-with-image',
  documentRateLimit,
  documentUpload.single('document'),
  healthInsightsController.analyzeDocumentWithImage
);

// Session routes (no rate limits)
router.post('/sessions', healthInsightsController.createSession);
router.get('/sessions', healthInsightsController.getSessions);
router.get('/sessions/:id', healthInsightsController.getSession);
router.delete('/sessions/:id', healthInsightsController.deleteSession);

// Sample topics route (no rate limit)
router.get('/sample-topics', healthInsightsController.getSampleTopics);

module.exports = router;