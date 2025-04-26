const express = require('express');
const { protect } = require('../middleware/auth');
const paymentController = require('../controllers/paymentController');
const {
    createPaymentOrder,
    capturePayment,
    getPaymentDetails,
    getPaymentHistory,
    getPaymentAnalytics,
    getRefundHistory,
    getPendingPayments,
    handleWebhook
} = require('../controllers/paymentController');

const router = express.Router();

// Public webhook route (needs to be before protect middleware)
router.post('/webhook', handleWebhook);

// Protected routes
router.use(protect);

// Payment creation and capture routes
router.post('/create-order', createPaymentOrder);
router.post('/capture/:orderId', capturePayment);

// Fixed routes first (most specific routes)
router.get('/history', getPaymentHistory);
router.get('/analytics', getPaymentAnalytics);
router.get('/refunds', getRefundHistory);
router.get('/pending', getPendingPayments);

// Parameter routes last (dynamic routes)
router.get('/:paymentId/receipt', paymentController.getReceipt);
router.get('/:paymentId', getPaymentDetails);

module.exports = router;