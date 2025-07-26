const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ExamPaper = require('../models/ExamPaper');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const router = express.Router();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Create storage for Cloudinary (PDFs only)
const cloudinaryStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'exam-papers',
    format: async (req, file) => 'pdf',
    resource_type: 'raw'
  }
});

// Local storage for non-PDF files
const lostFoundDir = path.join(__dirname, '../public/lostfound');
if (!fs.existsSync(lostFoundDir)) {
  fs.mkdirSync(lostFoundDir, { recursive: true });
}

const localStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, lostFoundDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  const allowed = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF and Word documents are allowed'));
  }
};

// Middleware to handle upload based on file type
const uploadFile = (req, res, next) => {
  const isPDF = req.fileFilterData?.mimetype === 'application/pdf';
  
  const upload = multer({
    storage: isPDF ? cloudinaryStorage : localStorage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      fileFilter(req, file, (err, accept) => {
        if (err) return cb(err);
        req.fileFilterData = file;
        cb(null, accept);
      });
    }
  }).single('file');

  upload(req, res, next);
};

// POST - Upload paper
router.post('/', (req, res) => {
  uploadFile(req, res, async (err) => {
    if (err) return res.status(400).json({ success: false, error: err.message });

    try {
      const { subject, semester, year, uploadedBy, postedByEmail } = req.body;

      if (!subject || !semester || !year || !req.file) {
        // Clean up uploaded file if validation fails
        if (req.file) {
          if (req.fileFilterData.mimetype === 'application/pdf') {
            await cloudinary.uploader.destroy(req.file.filename);
          } else {
            fs.unlinkSync(path.join(lostFoundDir, req.file.filename));
          }
        }
        return res.status(400).json({ success: false, error: 'Missing required fields or file' });
      }

      const isPDF = req.fileFilterData.mimetype === 'application/pdf';
      const fileData = {
        subject: subject.trim(),
        semester: Number(semester),
        year: Number(year),
        uploadedBy: uploadedBy?.trim() || 'Anonymous',
        postedByEmail: postedByEmail?.trim() || '',
        fileName: isPDF ? req.file.path : req.file.filename,
        originalName: req.file.originalname,
        fileType: isPDF ? 'pdf' : 'other',
        datePosted: new Date()
      };

      if (isPDF) {
        fileData.cloudinaryId = req.file.filename;
      }

      const paper = new ExamPaper(fileData);
      await paper.save();

      res.status(201).json({
        success: true,
        message: 'Paper uploaded successfully',
        data: paper
      });
    } catch (error) {
      // Clean up on error
      if (req.file) {
        try {
          if (req.fileFilterData.mimetype === 'application/pdf') {
            await cloudinary.uploader.destroy(req.file.filename);
          } else {
            fs.unlinkSync(path.join(lostFoundDir, req.file.filename));
          }
        } catch (cleanupError) {
          console.error('Cleanup error:', cleanupError);
        }
      }
      res.status(500).json({ success: false, error: error.message });
    }
  });
});

// GET - Download paper
router.get('/download/:id', async (req, res) => {
  try {
    const paper = await ExamPaper.findById(req.params.id);
    if (!paper) {
      return res.status(404).json({ success: false, error: 'Paper not found' });
    }

    if (paper.fileType === 'pdf') {
      // Generate Cloudinary download URL
      const url = cloudinary.url(paper.cloudinaryId, {
        resource_type: 'raw',
        attachment: true,
        filename: paper.originalName
      });
      return res.redirect(url);
    } else {
      // Local file download
      const filePath = path.join(lostFoundDir, paper.fileName);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, error: 'File not found' });
      }

      res.setHeader('Content-Disposition', `attachment; filename="${paper.originalName}"`);
      res.setHeader('Content-Type', 'application/octet-stream');

      const readStream = fs.createReadStream(filePath);
      readStream.on('error', () => {
        res.status(500).json({ success: false, error: 'Download failed' });
      });
      readStream.pipe(res);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE - Delete an exam paper
router.delete('/:id', async (req, res) => {
  try {
    const paper = await ExamPaper.findById(req.params.id);
    if (!paper) return res.status(404).json({ success: false, error: 'Paper not found' });

    // Delete the associated file
    if (paper.fileType === 'pdf') {
      await cloudinary.uploader.destroy(paper.cloudinaryId, { resource_type: 'raw' });
    } else {
      const filePath = path.join(lostFoundDir, paper.fileName);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    await paper.deleteOne();
    res.json({ success: true, message: 'Paper deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET - Fetch papers (keep this the same as before)
router.get('/', async (req, res) => {
  try {
    const { subject, semester, year } = req.query;
    const filter = {};
    if (subject) filter.subject = subject;
    if (semester) filter.semester = Number(semester);
    if (year) filter.year = Number(year);

    const papers = await ExamPaper.find(filter).sort('-datePosted');
    res.json({ success: true, data: papers });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
