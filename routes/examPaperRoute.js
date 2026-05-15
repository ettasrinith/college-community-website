const express = require('express');
const multer = require('multer');
const ExamPaper = require('../models/ExamPaper');
const requireAuth = require('../middleware/requireAuth');

const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

const cloudinaryStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => ({
    folder: 'exam-papers',
    resource_type: 'raw',
    public_id: `${Date.now()}-${file.originalname.replace(/\.[^/.]+$/, "")}`,
    use_filename: true,
    unique_filename: false,
  }),
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files are allowed for exam papers'), false);
  }
};

const upload = multer({
  storage: cloudinaryStorage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10 MB
  }
}).single('file');

const router = express.Router();

/* =========================================================
   UPLOAD EXAM PAPER (AUTH REQUIRED)
========================================================= */
router.post('/', requireAuth, (req, res) => {
  upload(req, res, async (err) => {

    if (err) {
      return res.status(400).json({
        success: false,
        error: err.message
      });
    }

    try {

      const {
        subject,
        semester,
        year,
        uploadedBy
      } = req.body;

      if (!subject || !semester || !year || !req.file) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields'
        });
      }

      // Extra safety check
      if (req.file.mimetype !== 'application/pdf') {
        return res.status(400).json({
          success: false,
          error: 'Only PDF files allowed'
        });
      }

      const paper = new ExamPaper({
        subject: subject.trim(),
        semester: Number(semester),
        year: Number(year),

        uploadedBy:
          uploadedBy?.trim() ||
          req.user.name ||
          req.user.displayName ||
          'Anonymous',

        // NEVER trust client email
        postedByEmail: req.user.email,

        fileType: 'pdf',

        cloudinaryId: req.file.public_id,

        // Secure cloudinary URL
        fileName: req.file.secure_url,

        originalName: req.file.originalname,

        datePosted: new Date(),
      });

      await paper.save();

      return res.status(201).json({
        success: true,
        message: 'PDF uploaded successfully',
        paper
      });

    } catch (error) {

      console.error('[Exam Upload Error]', error);

      return res.status(500).json({
        success: false,
        error: 'Database Error: ' + error.message
      });
    }
  });
});

/* =========================================================
   DOWNLOAD EXAM PAPER (AUTH REQUIRED)
========================================================= */
router.get('/download/:id', requireAuth, async (req, res) => {

  try {

    const paper = await ExamPaper.findById(req.params.id);

    if (
      !paper ||
      !paper.cloudinaryId ||
      paper.fileType !== 'pdf'
    ) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }

    const downloadUrl = cloudinary.url(
      paper.cloudinaryId,
      {
        resource_type: 'raw',
        secure: true,
        flags: 'attachment',
      }
    );

    const safeOriginalName = String(
      paper.originalName || 'file.pdf'
    ).replace(/[^\w.\-]/g, '_');

    const filename = safeOriginalName.endsWith('.pdf')
      ? safeOriginalName
      : `${safeOriginalName}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`
    );

    return res.redirect(downloadUrl);

  } catch (error) {

    console.error('[Exam Download Error]', error);

    return res.status(500).json({
      success: false,
      error: 'Download failed'
    });
  }
});

/* =========================================================
   LIST EXAM PAPERS
========================================================= */
router.get('/', async (req, res) => {

  try {

    const {
      subject,
      semester,
      year
    } = req.query;

    const filter = {};

    if (subject) {
      filter.subject = subject;
    }

    if (semester) {
      filter.semester = Number(semester);
    }

    if (year) {
      filter.year = Number(year);
    }

    const papers = await ExamPaper
      .find(filter)
      .sort('-datePosted');

    return res.json({
      success: true,
      data: papers
    });

  } catch (err) {

    return res.status(500).json({
      success: false,
      error: `Failed to fetch papers: ${err.message}`
    });
  }
});

/* =========================================================
   DELETE EXAM PAPER (OWNER ONLY)
========================================================= */
router.delete('/:id', requireAuth, async (req, res) => {

  try {

    const paper = await ExamPaper.findById(req.params.id);

    if (!paper) {
      return res.status(404).json({
        success: false,
        error: 'Exam paper not found'
      });
    }

    // OWNER CHECK
    if (paper.postedByEmail !== req.user.email) {

      return res.status(403).json({
        success: false,
        error: 'You can only delete your own uploads'
      });
    }

    // Delete from Cloudinary
    if (
      paper.fileType === 'pdf' &&
      paper.cloudinaryId
    ) {

      try {

        await cloudinary.uploader.destroy(
          paper.cloudinaryId,
          {
            resource_type: 'raw'
          }
        );

      } catch (cloudErr) {

        console.error(
          'Cloudinary delete error:',
          cloudErr
        );
      }
    }

    // Delete from MongoDB
    await paper.deleteOne();

    return res.json({
      success: true,
      message: 'Exam paper deleted successfully'
    });

  } catch (err) {

    console.error('[Exam Delete Error]', err);

    return res.status(500).json({
      success: false,
      error: 'Delete failed'
    });
  }
});

module.exports = router;
