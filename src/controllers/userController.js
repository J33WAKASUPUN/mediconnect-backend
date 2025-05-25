const User = require('../models/User');
const { getCurrentUTC } = require('../utils/dateTime');
const Conversation = require('../models/Conversation');

// @desc    Get all users by role
// @route   GET /api/auth/users
// @access  Private
exports.getUsersByRole = async (req, res, next) => {
    try {
        const { role } = req.query;
        
        // Build query
        const query = role ? { role } : {};

        // Get users
        const users = await User.find(query)
            .select('-password')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            timestamp: getCurrentUTC(),
            count: users.length,
            data: users
        });
    } catch (error) {
        next(error);
    }
};

exports.getPatientsWhoMessaged = async (req, res, next) => {
  try {
    const doctorId = req.user.id;

    // Find all conversations where the doctor is a participant
    const conversations = await Conversation.find({
      participants: doctorId,
    }).populate('participants', 'firstName lastName profilePicture role email');

    // Extract patients from these conversations
    const patients = [];
    const patientIds = new Set();

    conversations.forEach(conversation => {
      const patientParticipant = conversation.participants.find(
        participant => participant.role === 'patient' && participant._id.toString() !== doctorId
      );

      if (patientParticipant && !patientIds.has(patientParticipant._id.toString())) {
        patientIds.add(patientParticipant._id.toString());
        patients.push({
          _id: patientParticipant._id,
          firstName: patientParticipant.firstName,
          lastName: patientParticipant.lastName,
          profilePicture: patientParticipant.profilePicture,
          role: patientParticipant.role,
          email: patientParticipant.email,
        });
      }
    });

    res.status(200).json({
      success: true,
      timestamp: getCurrentUTC(),
      data: patients
    });
  } catch (error) {
    next(error);
  }
};