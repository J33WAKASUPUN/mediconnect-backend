const Review = require('../models/Review');
const Appointment = require('../models/Appointment');
const { getCurrentUTC } = require('../utils/dateTime');
const mongoose = require('mongoose'); // Add this line at the top

// @desc    Create review for an appointment
// @route   POST /api/reviews/:appointmentId
// @access  Private (Patient only)
exports.createReview = async (req, res, next) => {
    try {
        const appointment = await Appointment.findById(req.params.appointmentId);

        if (!appointment) {
            return res.status(404).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Appointment not found'
            });
        }

        // Check if user is the patient
        if (req.user.role !== 'patient' || appointment.patientId.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Not authorized to review this appointment'
            });
        }

        // Check if appointment is completed
        if (appointment.status !== 'completed') {
            return res.status(400).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Can only review completed appointments'
            });
        }

        // Check if review already exists
        const existingReview = await Review.findOne({ appointmentId: req.params.appointmentId });
        if (existingReview) {
            return res.status(400).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Review already exists for this appointment'
            });
        }

        const { rating, review, isAnonymous } = req.body;

        const newReview = await Review.create({
            appointmentId: appointment._id,
            patientId: req.user.id,
            doctorId: appointment.doctorId,
            rating,
            review,
            isAnonymous
        });

        res.status(201).json({
            success: true,
            timestamp: getCurrentUTC(),
            data: newReview
        });

    } catch (error) {
        next(error);
    }
};

// @desc    Get doctor's reviews
// @route   GET /api/reviews/doctor/:doctorId
// @access  Public
exports.getDoctorReviews = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const startIndex = (page - 1) * limit;

        // Convert string ID to ObjectId
        const doctorObjectId = new mongoose.Types.ObjectId(req.params.doctorId);

        const reviews = await Review.find({ doctorId: doctorObjectId })
            .populate({
                path: 'patientId',
                select: 'firstName lastName profilePicture'
            })
            .populate('appointmentId', 'dateTime')
            .sort({ createdAt: -1 })
            .skip(startIndex)
            .limit(limit);

        const total = await Review.countDocuments({ doctorId: doctorObjectId });

        // Calculate average rating
        const avgRating = await Review.aggregate([
            { $match: { doctorId: doctorObjectId } },
            { $group: { _id: null, average: { $avg: '$rating' } } }
        ]);

        // Process reviews to handle anonymous cases
        const processedReviews = reviews.map(review => {
            const reviewObj = review.toObject();
            if (reviewObj.isAnonymous) {
                reviewObj.patientId = {
                    _id: reviewObj.patientId._id,
                    firstName: 'Anonymous',
                    lastName: 'User',
                    profilePicture: null
                };
            }
            return reviewObj;
        });

        res.status(200).json({
            success: true,
            timestamp: getCurrentUTC(),
            data: {
                reviews: processedReviews,
                pagination: {
                    current: page,
                    total: Math.ceil(total / limit),
                    totalReviews: total
                },
                averageRating: avgRating[0]?.average || 0
            }
        });

    } catch (error) {
        // Add better error handling
        if (error.name === 'CastError') {
            return res.status(400).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Invalid doctor ID format'
            });
        }
        next(error);
    }
};

// @desc    Add doctor's response to a review
// @route   PUT /api/reviews/:reviewId/response
// @access  Private (Doctor only)
exports.addDoctorResponse = async (req, res, next) => {
    try {
        const review = await Review.findById(req.params.reviewId);

        if (!review) {
            return res.status(404).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Review not found'
            });
        }

        // Check if user is the doctor
        if (req.user.role !== 'doctor' || review.doctorId.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Not authorized to respond to this review'
            });
        }

        const { response } = req.body;

        review.doctorResponse = {
            content: response,
            respondedAt: getCurrentUTC()
        };

        await review.save();

        res.status(200).json({
            success: true,
            timestamp: getCurrentUTC(),
            data: review
        });

    } catch (error) {
        next(error);
    }
};

// @desc    Get doctor's review analytics
// @route   GET /api/reviews/doctor/:doctorId/analytics
// @access  Private (Doctor only)
exports.getDoctorReviewAnalytics = async (req, res, next) => {
    try {
        const doctorId = new mongoose.Types.ObjectId(req.params.doctorId);

        // Check if user is the doctor
        if (req.user.role !== 'doctor' || req.user.id !== req.params.doctorId) {
            return res.status(403).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Not authorized to view these analytics'
            });
        }

        // Get total reviews count
        const totalReviews = await Review.countDocuments({ doctorId });

        // Get rating distribution
        const ratingDistribution = await Review.aggregate([
            { $match: { doctorId } },
            {
                $group: {
                    _id: '$rating',
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: -1 } }
        ]);

        // Get monthly averages for the last 6 months
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const monthlyAverages = await Review.aggregate([
            {
                $match: {
                    doctorId,
                    createdAt: { $gte: sixMonthsAgo }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' }
                    },
                    averageRating: { $avg: '$rating' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { '_id.year': -1, '_id.month': -1 } }
        ]);

        // Format rating distribution
        const formattedRatingDistribution = {
            '5_star': 0,
            '4_star': 0,
            '3_star': 0,
            '2_star': 0,
            '1_star': 0
        };

        ratingDistribution.forEach(rating => {
            formattedRatingDistribution[`${rating._id}_star`] = rating.count;
        });

        // Format monthly averages
        const formattedMonthlyAverages = {};
        monthlyAverages.forEach(month => {
            const monthKey = `${month._id.year}-${String(month._id.month).padStart(2, '0')}`;
            formattedMonthlyAverages[monthKey] = {
                average: parseFloat(month.averageRating.toFixed(2)),
                count: month.count
            };
        });

        // Calculate overall statistics
        const overallStats = await Review.aggregate([
            { $match: { doctorId } },
            {
                $group: {
                    _id: null,
                    averageRating: { $avg: '$rating' },
                    totalReviews: { $sum: 1 },
                    anonymousCount: {
                        $sum: { $cond: ['$isAnonymous', 1, 0] }
                    }
                }
            }
        ]);

        res.status(200).json({
            success: true,
            timestamp: getCurrentUTC(),
            data: {
                overall: {
                    totalReviews,
                    averageRating: overallStats[0]?.averageRating 
                        ? parseFloat(overallStats[0].averageRating.toFixed(2)) 
                        : 0,
                    anonymousPercentage: overallStats[0]
                        ? parseFloat(((overallStats[0].anonymousCount / overallStats[0].totalReviews) * 100).toFixed(1))
                        : 0
                },
                ratingDistribution: formattedRatingDistribution,
                monthlyStats: formattedMonthlyAverages,
                lastUpdated: getCurrentUTC()
            }
        });

    } catch (error) {
        if (error.name === 'CastError') {
            return res.status(400).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Invalid doctor ID format'
            });
        }
        next(error);
    }
};

// @desc    Get patient's reviews
// @route   GET /api/reviews/patient/:patientId
// @access  Private
exports.getPatientReviews = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const startIndex = (page - 1) * limit;

        // Convert string ID to ObjectId
        const patientObjectId = new mongoose.Types.ObjectId(req.params.patientId);

        const reviews = await Review.find({ patientId: patientObjectId })
            .populate({
                path: 'doctorId',
                select: 'firstName lastName profilePicture'
            })
            .populate('appointmentId', 'dateTime')
            .sort({ createdAt: -1 })
            .skip(startIndex)
            .limit(limit);

        const total = await Review.countDocuments({ patientId: patientObjectId });

        res.status(200).json({
            success: true,
            timestamp: getCurrentUTC(),
            data: {
                reviews,
                pagination: {
                    current: page,
                    total: Math.ceil(total / limit),
                    totalReviews: total
                }
            }
        });

    } catch (error) {
        if (error.name === 'CastError') {
            return res.status(400).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Invalid patient ID format'
            });
        }
        next(error);
    }
};