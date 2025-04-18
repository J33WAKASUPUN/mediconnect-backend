const MedicalRecord = require('../models/MedicalRecord');
const Appointment = require('../models/Appointment');
const { getCurrentUTC } = require('../utils/dateTime');
const fs = require('fs');
const { generateMedicalRecordPDF } = require('../utils/pdfGenerator');
const mongoose = require('mongoose'); 

// @desc    Create medical record
// @route   POST /api/medical-records/:appointmentId
// @access  Private (Doctor only)
exports.createMedicalRecord = async (req, res, next) => {
    try {
        const appointment = await Appointment.findById(req.params.appointmentId);

        if (!appointment) {
            return res.status(404).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Appointment not found'
            });
        }

        // Check if user is the doctor
        if (req.user.role !== 'doctor' || appointment.doctorId.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Not authorized to create medical record'
            });
        }

        // Check if appointment is completed
        if (appointment.status !== 'completed') {
            return res.status(400).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Can only create medical record for completed appointments'
            });
        }

        // Check if medical record already exists
        const existingRecord = await MedicalRecord.findOne({ appointmentId: req.params.appointmentId });
        if (existingRecord) {
            return res.status(400).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Medical record already exists for this appointment'
            });
        }

        const medicalRecord = await MedicalRecord.create({
            ...req.body,
            appointmentId: appointment._id,
            patientId: appointment.patientId,
            doctorId: req.user.id
        });

        res.status(201).json({
            success: true,
            timestamp: getCurrentUTC(),
            data: medicalRecord
        });

    } catch (error) {
        next(error);
    }
};

// @desc    Get medical record by ID
// @route   GET /api/medical-records/:id
// @access  Private (Doctor & Patient)
exports.getMedicalRecord = async (req, res, next) => {
    try {
        const medicalRecord = await MedicalRecord.findById(req.params.id)
            .populate('patientId', 'firstName lastName')
            .populate('doctorId', 'firstName lastName specialization')
            .populate('appointmentId', 'dateTime');

        if (!medicalRecord) {
            return res.status(404).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Medical record not found'
            });
        }

        // Check authorization
        if (
            req.user.role !== 'admin' &&
            medicalRecord.patientId._id.toString() !== req.user.id &&
            medicalRecord.doctorId._id.toString() !== req.user.id
        ) {
            return res.status(403).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Not authorized to view this medical record'
            });
        }

        res.status(200).json({
            success: true,
            timestamp: getCurrentUTC(),
            data: medicalRecord
        });

    } catch (error) {
        next(error);
    }
};

// @desc    Get patient's medical records
// @route   GET /api/medical-records/patient/:patientId
// @access  Private (Doctor & Patient)
exports.getPatientMedicalRecords = async (req, res, next) => {
    try {
        // Check authorization
        if (
            req.user.role !== 'admin' &&
            req.params.patientId !== req.user.id &&
            req.user.role !== 'doctor'
        ) {
            return res.status(403).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Not authorized to view these medical records'
            });
        }

        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const startIndex = (page - 1) * limit;

        const records = await MedicalRecord.find({ patientId: req.params.patientId })
            .populate('doctorId', 'firstName lastName specialization')
            .populate('appointmentId', 'dateTime')
            .sort({ createdAt: -1 })
            .skip(startIndex)
            .limit(limit);

        const total = await MedicalRecord.countDocuments({ patientId: req.params.patientId });

        res.status(200).json({
            success: true,
            timestamp: getCurrentUTC(),
            data: {
                records,
                pagination: {
                    current: page,
                    total: Math.ceil(total / limit),
                    totalRecords: total
                }
            }
        });

    } catch (error) {
        next(error);
    }
};

// @desc    Update medical record
// @route   PUT /api/medical-records/:id
// @access  Private (Doctor only)
exports.updateMedicalRecord = async (req, res, next) => {
    try {
        let medicalRecord = await MedicalRecord.findById(req.params.id);

        if (!medicalRecord) {
            return res.status(404).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Medical record not found'
            });
        }

        // Check if user is the doctor who created the record
        if (req.user.role !== 'doctor' || medicalRecord.doctorId.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Not authorized to update this medical record'
            });
        }

        // Don't allow updating if status is 'final'
        if (medicalRecord.status === 'final') {
            return res.status(400).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Cannot update finalized medical record'
            });
        }

        medicalRecord = await MedicalRecord.findByIdAndUpdate(
            req.params.id,
            req.body,
            {
                new: true,
                runValidators: true
            }
        );

        res.status(200).json({
            success: true,
            timestamp: getCurrentUTC(),
            data: medicalRecord
        });

    } catch (error) {
        next(error);
    }
};

// @desc    Add attachments to medical record
// @route   POST /api/medical-records/record/:id/attachments
// @access  Private (Doctor only)
exports.addAttachments = async (req, res, next) => {
    try {
        const medicalRecord = await MedicalRecord.findById(req.params.id);

        if (!medicalRecord) {
            // Delete uploaded files if medical record not found
            if (req.files) {
                req.files.forEach(file => {
                    fs.unlinkSync(file.path);
                });
            }
            return res.status(404).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Medical record not found'
            });
        }

        // Check if user is the doctor who created the record
        if (req.user.role !== 'doctor' || medicalRecord.doctorId.toString() !== req.user.id) {
            // Delete uploaded files if not authorized
            if (req.files) {
                req.files.forEach(file => {
                    fs.unlinkSync(file.path);
                });
            }
            return res.status(403).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Not authorized to update this medical record'
            });
        }

        // Don't allow updating if status is 'final'
        if (medicalRecord.status === 'final') {
            // Delete uploaded files if record is final
            if (req.files) {
                req.files.forEach(file => {
                    fs.unlinkSync(file.path);
                });
            }
            return res.status(400).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Cannot update finalized medical record'
            });
        }

        // Add new attachments
        const newAttachments = req.files.map(file => ({
            fileName: file.originalname,
            fileType: file.mimetype,
            fileUrl: `${req.protocol}://${req.get('host')}/${file.path}`
        }));

        medicalRecord.attachments.push(...newAttachments);
        await medicalRecord.save();

        res.status(200).json({
            success: true,
            timestamp: getCurrentUTC(),
            data: medicalRecord.attachments
        });

    } catch (error) {
        // Delete uploaded files if there's an error
        if (req.files) {
            req.files.forEach(file => {
                fs.unlinkSync(file.path);
            });
        }
        next(error);
    }
};

// @desc    Delete attachment from medical record
// @route   DELETE /api/medical-records/record/:id/attachments/:attachmentId
// @access  Private (Doctor only)
exports.deleteAttachment = async (req, res, next) => {
    try {
        const medicalRecord = await MedicalRecord.findById(req.params.id);

        if (!medicalRecord) {
            return res.status(404).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Medical record not found'
            });
        }

        // Check if user is the doctor who created the record
        if (req.user.role !== 'doctor' || medicalRecord.doctorId.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Not authorized to update this medical record'
            });
        }

        // Don't allow updating if status is 'final'
        if (medicalRecord.status === 'final') {
            return res.status(400).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Cannot update finalized medical record'
            });
        }

        // Find attachment
        const attachment = medicalRecord.attachments.id(req.params.attachmentId);
        if (!attachment) {
            return res.status(404).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Attachment not found'
            });
        }

        try {
            // Delete file from storage
            const filePath = attachment.fileUrl.split('/uploads/')[1];
            const fullPath = `uploads/${filePath}`;
            
            if (fs.existsSync(fullPath)) {
                fs.unlinkSync(fullPath);
            }
        } catch (err) {
            console.log('File deletion error:', err);
            // Continue even if file deletion fails
        }

        // Remove attachment from record
        medicalRecord.attachments = medicalRecord.attachments.filter(
            a => a._id.toString() !== req.params.attachmentId
        );
        await medicalRecord.save();

        res.status(200).json({
            success: true,
            timestamp: getCurrentUTC(),
            message: 'Attachment deleted successfully'
        });

    } catch (error) {
        next(error);
    }
};

// @desc    Generate PDF for medical record
// @route   GET /api/medical-records/record/:id/pdf
// @access  Private (Doctor & Patient)
exports.generatePDF = async (req, res, next) => {
    try {
        const medicalRecord = await MedicalRecord.findById(req.params.id)
            .populate('doctorId', 'firstName lastName specialization')
            .populate('patientId', 'firstName lastName')
            .populate('appointmentId', 'dateTime');

        if (!medicalRecord) {
            return res.status(404).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Medical record not found'
            });
        }

        // Check authorization
        if (
            req.user.role !== 'admin' &&
            medicalRecord.patientId._id.toString() !== req.user.id &&
            medicalRecord.doctorId._id.toString() !== req.user.id
        ) {
            return res.status(403).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Not authorized to access this medical record'
            });
        }

        const pdfPath = await generateMedicalRecordPDF(medicalRecord);

        // Determine if it's a download or preview request
        const isDownload = req.query.download === 'true';
        const disposition = isDownload ? 'attachment' : 'inline';
        const fileName = `medical_record_${medicalRecord._id}.pdf`;

        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `${disposition}; filename="${fileName}"`);
        
        // For direct download, use res.download
        if (isDownload) {
            res.download(pdfPath, fileName, (err) => {
                if (err) {
                    next(err);
                }
                // Clean up file after download
                fs.unlink(pdfPath, (unlinkErr) => {
                    if (unlinkErr) console.error('Error deleting temporary PDF:', unlinkErr);
                });
            });
        } else {
            // For preview, use streaming
            const fileStream = fs.createReadStream(pdfPath);
            fileStream.pipe(res);

            // Clean up file after preview
            fileStream.on('end', () => {
                fs.unlink(pdfPath, (err) => {
                    if (err) console.error('Error deleting temporary PDF:', err);
                });
            });
        }

    } catch (error) {
        next(error);
    }
};


// @desc    Search medical records
// @route   GET /api/medical-records/search
// @access  Private (Doctor & Patient)
exports.searchMedicalRecords = async (req, res, next) => {
    try {
        const {
            startDate,
            endDate,
            diagnosis,
            status,
            patientId
        } = req.query;

        let query = {};

        // Date range
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        // Diagnosis search
        if (diagnosis) {
            query.diagnosis = { $regex: diagnosis, $options: 'i' };
        }

        // Status filter
        if (status) {
            query.status = status;
        }

        // Access control
        if (req.user.role === 'patient') {
            query.patientId = req.user.id;
        } else if (req.user.role === 'doctor') {
            if (patientId) {
                query.patientId = patientId;
            }
            query.doctorId = req.user.id;
        }

        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const startIndex = (page - 1) * limit;

        const records = await MedicalRecord.find(query)
            .populate('doctorId', 'firstName lastName specialization')
            .populate('patientId', 'firstName lastName')
            .populate('appointmentId', 'dateTime')
            .sort({ createdAt: -1 })
            .skip(startIndex)
            .limit(limit);

        const total = await MedicalRecord.countDocuments(query);

        res.status(200).json({
            success: true,
            timestamp: getCurrentUTC(),
            data: {
                records,
                pagination: {
                    current: page,
                    total: Math.ceil(total / limit),
                    totalRecords: total
                }
            }
        });

    } catch (error) {
        next(error);
    }
};

// @desc    Get medical records statistics
// @route   GET /api/medical-records/stats
// @access  Private (Doctor only)
exports.getMedicalRecordStats = async (req, res, next) => {
    try {
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 1);

        // Daily records count for last 30 days
        const dailyStats = await MedicalRecord.aggregate([
            {
                $match: {
                    doctorId: new mongoose.Types.ObjectId(req.user.id),
                    createdAt: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: "$createdAt" },
                        month: { $month: "$createdAt" },
                        day: { $dayOfMonth: "$createdAt" }
                    },
                    count: { $sum: 1 },
                    patients: { $addToSet: "$patientId" }
                }
            },
            {
                $project: {
                    _id: 0,
                    date: {
                        $dateFromParts: {
                            year: "$_id.year",
                            month: "$_id.month",
                            day: "$_id.day"
                        }
                    },
                    recordsCount: "$count",
                    uniquePatientsCount: { $size: "$patients" }
                }
            },
            { $sort: { date: -1 } }
        ]);

        // Common diagnoses
        const commonDiagnoses = await MedicalRecord.aggregate([
            {
                $match: {
                    doctorId: new mongoose.Types.ObjectId(req.user.id)
                }
            },
            {
                $group: {
                    _id: "$diagnosis",
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } },
            { $limit: 5 }
        ]);

        // Status distribution
        const statusStats = await MedicalRecord.aggregate([
            {
                $match: {
                    doctorId: new mongoose.Types.ObjectId(req.user.id)
                }
            },
            {
                $group: {
                    _id: "$status",
                    count: { $sum: 1 }
                }
            }
        ]);

        // Monthly trend
        const monthlyTrend = await MedicalRecord.aggregate([
            {
                $match: {
                    doctorId: new mongoose.Types.ObjectId(req.user.id)
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: "$createdAt" },
                        month: { $month: "$createdAt" }
                    },
                    count: { $sum: 1 },
                    uniquePatients: { $addToSet: "$patientId" }
                }
            },
            {
                $project: {
                    _id: 0,
                    month: {
                        $dateFromParts: {
                            year: "$_id.year",
                            month: "$_id.month"
                        }
                    },
                    recordsCount: "$count",
                    patientsCount: { $size: "$uniquePatients" }
                }
            },
            { $sort: { month: -1 } },
            { $limit: 12 }
        ]);

        res.status(200).json({
            success: true,
            timestamp: getCurrentUTC(),
            data: {
                dailyStats,
                commonDiagnoses,
                statusStats,
                monthlyTrend
            }
        });

    } catch (error) {
        next(error);
    }
};