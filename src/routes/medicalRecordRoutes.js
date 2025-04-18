const express = require('express');
const router = express.Router();
const upload = require('../utils/fileUpload');
const {
    createMedicalRecord,
    getMedicalRecord,
    getPatientMedicalRecords,
    updateMedicalRecord,
    addAttachments,
    deleteAttachment,
    generatePDF,
    searchMedicalRecords,
    getMedicalRecordStats
} = require('../controllers/medicalRecordController');
const { protect, authorize } = require('../middleware/auth');

// Apply authentication middleware to all routes
router.use(protect);

// Public routes (after authentication)
router.route('/record/:id/pdf').get(generatePDF);
router.route('/search').get(searchMedicalRecords);

// Doctor only routes
router.route('/:appointmentId').post(authorize('doctor'), createMedicalRecord);
router.route('/record/:id')
    .get(getMedicalRecord)
    .put(authorize('doctor'), updateMedicalRecord);

router.route('/patient/:patientId').get(getPatientMedicalRecords);

// File management routes (doctor only)
router.route('/record/:id/attachments')
    .post(authorize('doctor'), upload.array('files', 5), addAttachments);

router.route('/record/:id/attachments/:attachmentId')
    .delete(authorize('doctor'), deleteAttachment);

// Statistics route (doctor only)
router.route('/stats').get(authorize('doctor'), getMedicalRecordStats);

module.exports = router;