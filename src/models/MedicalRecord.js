const mongoose = require('mongoose');

const medicalRecordSchema = new mongoose.Schema({
    patientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    doctorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    appointmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Appointment',
        required: true
    },
    notes: {
        type: String,
        required: [true, 'Please provide appointment notes'],
        trim: true,
        maxlength: [2000, 'Notes cannot be more than 2000 characters']
    },
    diagnosis: {
        type: String,
        required: [true, 'Please provide diagnosis'],
        trim: true,
        maxlength: [500, 'Diagnosis cannot be more than 500 characters']
    },
    prescriptions: [{
        medicine: {
            type: String,
            required: [true, 'Please provide medicine name'],
            trim: true
        },
        dosage: {
            type: String,
            required: [true, 'Please provide dosage'],
            trim: true
        },
        frequency: {
            type: String,
            required: [true, 'Please provide frequency'],
            trim: true
        },
        duration: {
            type: String,
            required: [true, 'Please provide duration'],
            trim: true
        },
        instructions: {
            type: String,
            trim: true
        }
    }],
    testResults: [{
        testName: {
            type: String,
            required: [true, 'Please provide test name'],
            trim: true
        },
        result: {
            type: String,
            required: [true, 'Please provide test result'],
            trim: true
        },
        normalRange: {
            type: String,
            trim: true
        },
        remarks: {
            type: String,
            trim: true
        },
        date: {
            type: Date,
            default: Date.now
        }
    }],
    attachments: [{
        fileName: {
            type: String,
            required: true
        },
        fileType: {
            type: String,
            required: true
        },
        fileUrl: {
            type: String,
            required: true
        },
        uploadedAt: {
            type: Date,
            default: Date.now
        }
    }],
    nextVisitDate: {
        type: Date
    },
    status: {
        type: String,
        enum: ['draft', 'final'],
        default: 'draft'
    }
}, {
    timestamps: true
});

// Indexes for efficient querying
medicalRecordSchema.index({ patientId: 1, createdAt: -1 });
medicalRecordSchema.index({ doctorId: 1, createdAt: -1 });
medicalRecordSchema.index({ appointmentId: 1 }, { unique: true });

module.exports = mongoose.model('MedicalRecord', medicalRecordSchema);