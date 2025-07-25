const express = require('express');
const Announcement = require('../models/Announcement');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const admins = require('../config/admins.json');

const router = express.Router();

// Multer setup with organized storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Determine subfolder based on file type
        const subfolder = file.mimetype === 'application/pdf' ? 'pdfs' : 'images';
        const uploadPath = path.join(__dirname, '../announce', subfolder);
        
        // Ensure directory exists
        fs.mkdirSync(uploadPath, { recursive: true });
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);
        cb(null, `announcement-${Date.now()}${ext}`);
    }
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif'];
        if (allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only PDF and Image files are allowed'));
        }
    },
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

// Admin middleware
function checkAdmin(req, res, next) {
    const email = req.body.postedByEmail;
    if (!admins.includes(email)) {
        return res.status(403).json({ error: 'Only admins can create announcements' });
    }
    next();
}

// POST create announcement with file upload
router.post('/', upload.single('file'), checkAdmin, async (req, res) => {
    try {
        const { title, content, postedByName, postedByEmail } = req.body;

        // Determine file URL if file was uploaded
        let fileUrl = null;
        if (req.file) {
            const fileType = req.file.mimetype === 'application/pdf' ? 'pdfs' : 'images';
            fileUrl = `/announce/${fileType}/${req.file.filename}`;
        }

        const announcement = new Announcement({
            title,
            content,
            postedByName,
            postedByEmail,
            fileUrl
        });

        await announcement.save();
        res.status(201).json(announcement);

    } catch (err) {
        // Clean up uploaded file if there was an error
        if (req.file) {
            fs.unlink(req.file.path, () => {});
        }
        res.status(400).json({ error: err.message });
    }
});

// GET all announcements
router.get('/', async (req, res) => {
    try {
        const announcements = await Announcement.find().sort({ datePosted: -1 });
        res.json(announcements);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE announcement by id (admin only)
router.delete('/:id', async (req, res) => {
    try {
        const userEmail = req.body.userEmail || req.query.userEmail;
        const announcement = await Announcement.findById(req.params.id);

        if (!announcement) {
            return res.status(404).json({ error: 'Announcement not found' });
        }

        if (!admins.includes(userEmail)) {
            return res.status(403).json({ error: 'Not authorized to delete announcements' });
        }

        // Delete associated file if exists
        if (announcement.fileUrl) {
            const filePath = path.join(__dirname, '../', announcement.fileUrl);
            fs.unlink(filePath, (err) => {
                if (err) console.error('Failed to delete file:', err);
            });
        }

        await Announcement.findByIdAndDelete(req.params.id);
        res.json({ message: 'Announcement deleted' });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;