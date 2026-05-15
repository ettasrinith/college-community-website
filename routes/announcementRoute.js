const express = require('express');
const Announcement = require('../models/Announcement');
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;

const requireAdmin = require('../middleware/requireAdmin');

const router = express.Router();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// Allowed mimetypes for attachment (PDF or images)
const allowedMimeTypes = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif'
];

// Multer Storage using Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {

    let folder = 'announcements';

    // Separate subfolders
    if (file.mimetype === 'application/pdf') {
      folder += '/pdfs';
    } else {
      folder += '/images';
    }

    return {
      folder,
      allowed_formats: ['pdf', 'jpg', 'jpeg', 'png', 'gif'],
      resource_type:
        file.mimetype === 'application/pdf'
          ? 'raw'
          : 'image',
      public_id: `announcement-${Date.now()}`
    };
  },
});

// Multer upload middleware restriction
const upload = multer({
  storage,

  fileFilter: (req, file, cb) => {

    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and image files are allowed'));
    }
  },

  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

// ======================================================
// POST Create announcement (ADMIN ONLY)
// ======================================================

router.post(
  '/',
  requireAdmin,
  upload.single('file'),

  async (req, res) => {

    try {

      const {
        title,
        content,
        postedByName
      } = req.body;

      // Email now comes from logged-in session
      const postedByEmail = req.user.email;

      if (!title || !postedByName) {
        return res.status(400).json({
          error: 'Title and postedByName are required'
        });
      }

      let fileUrl = null;
      let cloudinaryPublicId = null;

      // File uploaded
      if (req.file) {
        fileUrl = req.file.path;
        cloudinaryPublicId = req.file.filename;
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

      // Cleanup uploaded file if DB save fails
      if (req.file && req.file.filename) {

        try {

          await cloudinary.uploader.destroy(
            req.file.filename,
            {
              resource_type:
                req.file.mimetype === 'application/pdf'
                  ? 'raw'
                  : 'image'
            }
          );

        } catch (cleanupError) {

          console.error(
            'Failed to cleanup uploaded file:',
            cleanupError
          );
        }
      }

      res.status(500).json({
        error: err.message || 'Server error'
      });
    }
  }
);

// ======================================================
// GET ALL ANNOUNCEMENTS
// ======================================================

router.get('/', async (req, res) => {

  try {

    const announcements = await Announcement
      .find()
      .sort({ datePosted: -1 });

    res.json(announcements);

  } catch (err) {

    console.error('Failed to fetch announcements:', err);

    res.status(500).json({
      error: 'Failed to load announcements'
    });
  }
});

// ======================================================
// DELETE ANNOUNCEMENT (ADMIN ONLY)
// ======================================================

router.delete(
  '/:id',
  requireAdmin,

  async (req, res) => {

    try {

      const announcement = await Announcement.findById(req.params.id);

      if (!announcement) {
        return res.status(404).json({
          error: 'Announcement not found'
        });
      }

      // Delete file from Cloudinary
      if (announcement.cloudinaryPublicId) {

        const resourceType =
          announcement.fileUrl &&
          announcement.fileUrl.includes('/pdfs/')
            ? 'raw'
            : 'image';

        try {

          await cloudinary.uploader.destroy(
            announcement.cloudinaryPublicId,
            {
              resource_type: resourceType
            }
          );

        } catch (cloudinaryError) {

          console.error(
            'Error deleting Cloudinary file:',
            cloudinaryError
          );
        }
      }

      await Announcement.findByIdAndDelete(req.params.id);

      res.json({
        message: 'Announcement deleted successfully'
      });

    } catch (err) {

      console.error('Error deleting announcement:', err);

      res.status(500).json({
        error: 'Failed to delete announcement'
      });
    }
  }
);

module.exports = router;