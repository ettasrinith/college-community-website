const express = require('express');
const Announcement = require('../models/Announcement');
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;
const admins = require('../config/admins.json');

const router = express.Router();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,  // Set in your .env file
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// Allowed mimetypes for attachment (PDF or images)
const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif'];

// Multer Storage using Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: (req, file) => {
    let folder = 'announcements'; // base folder on Cloudinary

    // Separate subfolders for pdfs and images
    if (file.mimetype === 'application/pdf') folder += '/pdfs';
    else if (['image/jpeg', 'image/png', 'image/gif'].includes(file.mimetype)) folder += '/images';

    return {
      folder,
      allowed_formats: ['pdf', 'jpg', 'jpeg', 'png', 'gif'],
      resource_type: (file.mimetype === 'application/pdf') ? 'raw' : 'image',
      public_id: `announcement-${Date.now()}`, // unique public id
    };
  },
});

// Multer upload middleware restriction
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (allowedMimeTypes.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only PDF and image files are allowed'));
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// Middleware to check if user is admin by email in req.body
function checkAdmin(req, res, next) {
  const email = req.body.postedByEmail || req.query.postedByEmail;
  if (!email || !admins.includes(email)) {
    return res.status(403).json({ error: 'Only admins can perform this action' });
  }
  next();
}

// POST Create announcement with optional file upload (admin only)
router.post('/', upload.single('file'), checkAdmin, async (req, res) => {
  try {
    const { title, content, postedByName, postedByEmail } = req.body;

    if (!title || !postedByName || !postedByEmail) {
      return res.status(400).json({ error: 'Title, postedByName, and postedByEmail are required' });
    }

    // Prepare file data if file uploaded
    let fileUrl = null;
    let cloudinaryPublicId = null;
    if (req.file) {
      fileUrl = req.file.path;        // Cloudinary URL
      cloudinaryPublicId = req.file.filename; // Public ID (multer-storage-cloudinary uses 'filename')
    }

    const newAnnouncement = new Announcement({
      title,
      content,
      postedByName,
      postedByEmail,
      fileUrl,
      cloudinaryPublicId,
      datePosted: new Date(),
    });

    await newAnnouncement.save();

    res.status(201).json(newAnnouncement);
  } catch (err) {
    console.error('Failed to post announcement:', err);
    // Delete uploaded file from Cloudinary if error after upload
    if (req.file && req.file.filename) {
      try {
        await cloudinary.uploader.destroy(req.file.filename, {
          resource_type: (req.file.mimetype === 'application/pdf') ? 'raw' : 'image',
        });
      } catch (e) {
        console.error('Failed to clean up uploaded file on error:', e);
      }
    }
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

// GET all announcements sorted by newest first
router.get('/', async (req, res) => {
  try {
    const announcements = await Announcement.find().sort({ datePosted: -1 });
    res.json(announcements);
  } catch (err) {
    console.error('Failed to fetch announcements:', err);
    res.status(500).json({ error: 'Failed to load announcements' });
  }
});

// DELETE announcement by id (admin only)
router.delete('/:id', checkAdmin, async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id);
    if (!announcement) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    // Delete associated file from Cloudinary if exists
    if (announcement.cloudinaryPublicId) {
      const resourceType = announcement.fileUrl?.includes('/pdfs/') ? 'raw' : 'image';

      try {
        await cloudinary.uploader.destroy(announcement.cloudinaryPublicId, { resource_type: resourceType });
      } catch (e) {
        console.error('Error deleting Cloudinary file:', e);
      }
    }

    await Announcement.findByIdAndDelete(req.params.id);

    res.json({ message: 'Announcement deleted successfully' });
  } catch (err) {
    console.error('Error deleting announcement:', err);
    res.status(500).json({ error: 'Failed to delete announcement' });
  }
});

module.exports = router;
