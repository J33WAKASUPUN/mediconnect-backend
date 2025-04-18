const multer = require('multer');
const path = require('path');
const { getFileTimestamp } = require('../utils/dateTime');

const storage = multer.diskStorage({
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

const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
        cb(null, true);
    } else {
        cb(new Error('Only .png, .jpg and .jpeg format allowed!'), false);
    }
};

exports.uploadProfilePicture = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: fileFilter
}).single('profilePicture');