const User = require('../models/User');
const { getCurrentUTC } = require('../utils/dateTime');
const logger = require('../utils/logger');

// @desc    Get current user's profile
// @route   GET /api/profile
// @access  Private
exports.getProfile = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        
        // Create a new object without the irrelevant profile
        const userData = user.toObject();
        
        // Remove the irrelevant profile based on role
        if (userData.role === 'patient') {
            delete userData.doctorProfile;
        } else if (userData.role === 'doctor') {
            delete userData.patientProfile;
        }

        res.status(200).json({
            success: true,
            timestamp: getCurrentUTC(),
            data: userData
        });

    } catch (error) {
        next(error);
    }
};

// @desc    Update basic profile
// @route   PUT /api/profile
// @access  Private
exports.updateProfile = async (req, res, next) => {
    try {
        const { firstName, lastName, phoneNumber, address } = req.body;

        const updatedUser = await User.findByIdAndUpdate(
            req.user.id,
            {
                firstName,
                lastName,
                phoneNumber,
                address,
                profilePicture: req.file ? `${process.env.BASE_URL}/uploads/profiles/${req.file.filename}` : req.user.profilePicture,
                updatedAt: getCurrentUTC() // 2025-03-11 14:30:34
            },
            { new: true, runValidators: true }
        ).select('-password');

        res.status(200).json({
            success: true,
            timestamp: getCurrentUTC(), // 2025-03-11 14:30:34
            data: updatedUser
        });

    } catch (error) {
        next(error);
    }
};

// @desc    Update patient profile
// @route   PUT /api/profile/patient
// @access  Private (Patient only)
exports.updatePatientProfile = async (req, res, next) => {
    try {
        // Check if user is a patient
        if (req.user.role !== 'patient') {
            return res.status(403).json({
                success: false,
                timestamp: getCurrentUTC(), // 2025-03-11 14:30:34
                message: 'Access denied. Only patients can update patient profile'
            });
        }

        const {
            bloodType,
            medicalHistory,
            allergies,
            emergencyContacts,
            currentMedications,
            chronicConditions,
            insuranceInfo
        } = req.body;

        const updatedUser = await User.findByIdAndUpdate(
            req.user.id,
            {
                patientProfile: {
                    bloodType,
                    medicalHistory,
                    allergies,
                    emergencyContacts,
                    currentMedications,
                    chronicConditions,
                    insuranceInfo,
                    lastCheckupDate: getCurrentUTC() // 2025-03-11 14:30:34
                },
                updatedAt: getCurrentUTC() // 2025-03-11 14:30:34
            },
            { new: true, runValidators: true }
        ).select('-password');

        res.status(200).json({
            success: true,
            timestamp: getCurrentUTC(), // 2025-03-11 14:30:34
            data: updatedUser
        });

    } catch (error) {
        next(error);
    }
};

// @desc    Update doctor profile
// @route   PUT /api/profile/doctor
// @access  Private (Doctor only)
exports.updateDoctorProfile = async (req, res, next) => {
    try {
        // Check if user is a doctor
        if (req.user.role !== 'doctor') {
            return res.status(403).json({
                success: false,
                timestamp: getCurrentUTC(), // 2025-03-11 14:30:34
                message: 'Access denied. Only doctors can update doctor profile'
            });
        }

        const {
            specialization,
            licenseNumber,
            yearsOfExperience,
            education,
            hospitalAffiliations,
            availableTimeSlots,
            consultationFees,
            expertise
        } = req.body;

        const updatedUser = await User.findByIdAndUpdate(
            req.user.id,
            {
                doctorProfile: {
                    specialization,
                    licenseNumber,
                    yearsOfExperience,
                    education,
                    hospitalAffiliations,
                    availableTimeSlots,
                    consultationFees,
                    expertise
                },
                updatedAt: getCurrentUTC() // 2025-03-11 14:30:34
            },
            { new: true, runValidators: true }
        ).select('-password');

        res.status(200).json({
            success: true,
            timestamp: getCurrentUTC(), // 2025-03-11 14:30:34
            data: updatedUser
        });

    } catch (error) {
        next(error);
    }
};