const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Insurance Info Schema
const insuranceInfoSchema = new mongoose.Schema({
    provider: {
        type: String,
        default: null
    },
    policyNumber: {
        type: String,
        default: null
    },
    expiryDate: {
        type: Date,
        default: null
    }
});

// Emergency Contact Schema
const emergencyContactSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Emergency contact name is required']
    },
    relationship: {
        type: String,
        required: [true, 'Relationship is required']
    },
    phone: {
        type: String,
        required: [true, 'Emergency contact phone is required']
    }
});

// Patient Profile Schema
const patientProfileSchema = new mongoose.Schema({
    bloodType: {
        type: String,
        enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
        default: null
    },
    medicalHistory: {
        type: [String],
        default: []
    },
    allergies: {
        type: [String],
        default: []
    },
    emergencyContacts: {
        type: [emergencyContactSchema],
        default: []
    },
    currentMedications: {
        type: [String],
        default: []
    },
    chronicConditions: {
        type: [String],
        default: []
    },
    insuranceInfo: {
        type: insuranceInfoSchema,
        default: () => ({})
    },
    lastCheckupDate: {
        type: Date,
        default: Date.now
    }
});

// Education Schema
const educationSchema = new mongoose.Schema({
    degree: {
        type: String,
        required: [true, 'Degree is required']
    },
    institution: {
        type: String,
        required: [true, 'Institution is required']
    },
    year: {
        type: Number,
        required: [true, 'Year is required']
    }
});

// Hospital Affiliation Schema
const hospitalAffiliationSchema = new mongoose.Schema({
    hospitalName: {
        type: String,
        required: [true, 'Hospital name is required']
    },
    role: {
        type: String,
        required: [true, 'Role is required']
    },
    startDate: {
        type: Date,
        required: [true, 'Start date is required']
    }
});

// Time Slot Schema
const timeSlotSchema = new mongoose.Schema({
    startTime: {
        type: String,
        required: [true, 'Start time is required']
    },
    endTime: {
        type: String,
        required: [true, 'End time is required']
    }
});

// Available Time Slots Schema
const availableTimeSlotsSchema = new mongoose.Schema({
    day: {
        type: String,
        enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        required: [true, 'Day is required']
    },
    slots: {
        type: [timeSlotSchema],
        default: []
    }
});

// Doctor Profile Schema
const doctorProfileSchema = new mongoose.Schema({
    specialization: {
        type: String,
        default: null
    },
    licenseNumber: {
        type: String,
        default: null
    },
    yearsOfExperience: {
        type: Number,
        default: 0
    },
    education: {
        type: [educationSchema],
        default: []
    },
    hospitalAffiliations: {
        type: [hospitalAffiliationSchema],
        default: []
    },
    availableTimeSlots: {
        type: [availableTimeSlotsSchema],
        default: []
    },
    consultationFees: {
        type: Number,
        default: 0
    },
    expertise: {
        type: [String],
        default: []
    }
});

// Main User Schema
const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: [true, 'Please add a username'],
        unique: true,
        trim: true
    },
    email: {
        type: String,
        required: [true, 'Please add an email'],
        unique: true,
        match: [
            /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
            'Please add a valid email'
        ]
    },
    password: {
        type: String,
        required: [true, 'Please add a password'],
        minlength: 6,
        select: false
    },
    role: {
        type: String,
        enum: ['patient', 'doctor'],
        required: [true, 'Please specify user role']
    },
    firstName: {
        type: String,
        required: [true, 'Please add a first name'],
        trim: true
    },
    lastName: {
        type: String,
        required: [true, 'Please add a last name'],
        trim: true
    },
    phoneNumber: {
        type: String,
        required: [true, 'Please add a phone number']
    },
    gender: {
        type: String,
        enum: ['male', 'female', 'other'],
        required: [true, 'Please specify gender']
    },
    address: {
        type: String,
        required: [true, 'Please add an address']
    },
    profilePicture: {
        type: String,
        default: null
    },
    // Only attach the relevant profile based on role
    patientProfile: {
        type: patientProfileSchema,
        default: function() {
            return this.role === 'patient' ? {} : undefined;
        }
    },
    doctorProfile: {
        type: doctorProfileSchema,
        default: function() {
            return this.role === 'doctor' ? {} : undefined;
        }
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Middleware to ensure only relevant profile exists
userSchema.pre('save', function(next) {
    if (this.role === 'patient') {
        this.doctorProfile = undefined;
    } else if (this.role === 'doctor') {
        this.patientProfile = undefined;
    }
    next();
});

// Match user entered password to hashed password in database
userSchema.methods.matchPassword = async function(enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

// Sign JWT and return
userSchema.methods.getSignedJwtToken = function() {
    return jwt.sign(
        { id: this._id },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRE }
    );
};

// Encrypt password using bcrypt
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) {
        next();
    }

    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

module.exports = mongoose.model('User', userSchema);