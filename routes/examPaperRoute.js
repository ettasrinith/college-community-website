// routes/examPaperRoute.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ExamPaper = require('../models/ExamPaper');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const router = express.Router();

// --- Cloudinary Configuration ---
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

// --- FIXED Cloudinary Storage for PDFs ---
const cloudinaryStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    // Extract filename without extension
    const nameWithoutExt = path.parse(file.originalname).name;
    
    return {
      folder: 'exam-papers',
      resource_type: 'raw',
      // IMPORTANT: Add .pdf extension to ensure proper file recognition
      public_id: `paper-${Date.now()}-${nameWithoutExt}.pdf`,
    };
  },
});

// --- File Filter (PDFs only) ---
const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files are allowed for exam papers'), false);
  }
};

// --- Multer Middleware ---
const upload = multer({
  storage: cloudinaryStorage,
  fileFilter: fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
}).single('file');

// --- POST - Upload Paper ---
router.post('/', (req, res) => {
  upload(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      console.error('[Multer Error - ExamPaper Upload]:', err);
      return res.status(400).json({ success: false, error: `Upload Error: ${err.message}` });
    } else if (err) {
      console.error('[File Filter Error - ExamPaper Upload]:', err);
      return res.status(400).json({ success: false, error: err.message });
    }

    try {
      const { subject, semester, year, uploadedBy, postedByEmail } = req.body;

      if (!subject || !semester || !year || !req.file) {
        const missingFields = [];
        if (!subject) missingFields.push('subject');
        if (!semester) missingFields.push('semester');
        if (!year) missingFields.push('year');
        if (!req.file) missingFields.push('file');

        return res.status(400).json({
          success: false,
          error: `Missing required fields: ${missingFields.join(', ')}`
        });
      }

      const cloudinaryUrl = req.file.path;
      const cloudinaryPublicId = req.file.filename;

      const fileData = {
        subject: subject.trim(),
        semester: Number(semester),
        year: Number(year),
        uploadedBy: uploadedBy?.trim() || 'Anonymous',
        postedByEmail: postedByEmail?.trim() || '',
        fileName: cloudinaryUrl,
        originalName: req.file.originalname,
        fileType: 'pdf',
        cloudinaryId: cloudinaryPublicId,
        datePosted: new Date()
      };

      const paper = new ExamPaper(fileData);
      await paper.save();

      res.status(201).json({
        success: true,
        message: 'PDF uploaded successfully to Cloudinary',
        paper: paper
      });

    } catch (error) {
      console.error('[Database Save Error - ExamPaper]:', error);
      res.status(500).json({ success: false, error: `Database Error: ${error.message}` });
    }
  });
});

// --- FIXED GET - Download Paper ---
router.get('/download/:id', async (req, res) => {
  try {
    const paper = await ExamPaper.findById(req.params.id);

    if (!paper) {
      return res.status(404).json({ success: false, error: 'Exam paper record not found' });
    }

    if (paper.fileType !== 'pdf' || !paper.fileName) {
       return res.status(400).json({ success: false, error: 'File not available for download' });
    }

    // Simple redirect to Cloudinary URL - browser will handle PDF properly
    res.redirect(paper.fileName);

  } catch (error) {
    console.error('[Download Error - ExamPaper]:', error);
    res.status(500).json({ success: false, error: `Download failed: ${error.message}` });
  }
});

// --- DELETE - Delete an Exam Paper ---
router.delete('/:id', async (req, res) => {
  try {
    const paper = await ExamPaper.findById(req.params.id);

    if (!paper) {
      return res.status(404).json({ success: false, error: 'Exam paper record not found' });
    }

    if (paper.fileType === 'pdf' && paper.cloudinaryId) {
      try {
        const destroyResult = await cloudinary.uploader.destroy(paper.cloudinaryId, { resource_type: 'raw' });

        if (destroyResult.result === 'ok') {
          console.log(`[Cloudinary Delete Success] Public ID: ${paper.cloudinaryId}`);
        } else {
          console.warn(`[Cloudinary Delete Warning] Public ID: ${paper.cloudinaryId}, Result: ${destroyResult.result}`);
        }
      } catch (cloudinaryDeleteErr) {
        console.error('[Cloudinary Delete Error]:', cloudinaryDeleteErr);
      }
    }

    await paper.deleteOne();
    res.json({ success: true, message: 'Exam paper record and associated file deleted successfully' });

  } catch (err) {
    console.error('[Delete Error - ExamPaper]:', err);
    res.status(500).json({ success: false, error: `Delete failed: ${err.message}` });
  }
});

// --- GET - Fetch Papers ---
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
    console.error('[Fetch Papers Error - ExamPaper]:', err);
    res.status(500).json({ success: false, error: `Failed to fetch papers: ${err.message}` });
  }
});

module.exports = router;
