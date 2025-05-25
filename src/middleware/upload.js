const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getFileTimestamp } = require('../utils/dateTime');

// Create directory if not exists
const createDirIfNotExists = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

// Ensure upload directories exist
createDirIfNotExists('uploads/profiles');
createDirIfNotExists('uploads/medical_images');
createDirIfNotExists('uploads/documents');

// Original profile picture storage
const profileStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/profiles');
    },
    filename: (req, file, cb) => {
        // Format: J33WAKASUPUN_2025-03-07-16-22-29.ext
        const timestamp = getFileTimestamp();
        const username = req.body.username ? req.body.username.toUpperCase() : 'UNKNOWN';
        const ext = path.extname(file.originalname);
        cb(null, `${username}_${timestamp}${ext}`);
    }
});

// Medical image storage
const medicalImageStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/medical_images');
    },
    filename: (req, file, cb) => {
        // Format: MEDICAL_J33WAKASUPUN_2025-03-07-16-22-29.ext
        const timestamp = getFileTimestamp();
        const username = req.user ? req.user.username.toUpperCase() : 'UNKNOWN';
        const ext = path.extname(file.originalname);
        cb(null, `MEDICAL_${username}_${timestamp}${ext}`);
    }
});

// Document storage
const documentStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/documents');
    },
    filename: (req, file, cb) => {
        // Format: DOC_J33WAKASUPUN_2025-03-07-16-22-29.ext
        const timestamp = getFileTimestamp();
        const username = req.user ? req.user.username.toUpperCase() : 'UNKNOWN';
        const ext = path.extname(file.originalname);
        cb(null, `DOC_${username}_${timestamp}${ext}`);
    }
});

// Image file filter
const imageFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
        cb(null, true);
    } else {
        cb(new Error('Only .png, .jpg and .jpeg format allowed!'), false);
    }
};

// Document file filter
const documentFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf|docx|doc|txt/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    
    if (extname) {
        cb(null, true);
    } else {
        cb(new Error('Only image, PDF, Word, and text files are allowed!'), false);
    }
};

// Export the configured multer instances
module.exports = {
    // Original profile picture uploader
    uploadProfilePicture: multer({
        storage: profileStorage,
        limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
        fileFilter: imageFilter
    }).single('profilePicture'),

    // Create multer instances but don't call .single() or .fields() yet
    // These will be used in the routes
    medicalImageUpload: multer({
        storage: medicalImageStorage,
        limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
        fileFilter: imageFilter
    }),

    documentUpload: multer({
        storage: documentStorage,
        limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
        fileFilter: documentFilter
    })
};