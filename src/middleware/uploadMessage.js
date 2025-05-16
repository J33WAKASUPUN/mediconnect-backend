const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Ensure directory exists
const createUploadsDir = () => {
    const dir = path.join(__dirname, '../../uploads/messages');
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
};

// Configure storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = createUploadsDir();
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = uuidv4();
        const fileExt = path.extname(file.originalname);
        cb(null, `${uniqueSuffix}${fileExt}`);
    }
});

// Filter file types
const fileFilter = (req, file, cb) => {
    // Allowed file types
    const allowedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const allowedDocTypes = [
        'application/pdf', 
        'application/msword', 
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain'
    ];
    
    if (allowedImageTypes.includes(file.mimetype) || allowedDocTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only images, documents and spreadsheets are allowed'), false);
    }
};

// Export upload middleware
exports.uploadMessageFile = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
}).single('file');