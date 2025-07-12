const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ExamPaper = require('../models/ExamPaper');
const router = express.Router();

// Configure upload directory
const uploadDir = path.join(__dirname, '../public/exampapers');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and Word documents are allowed!'), false);
    }
  }
}).single('file'); // Changed from .fields() to .single()

// POST - Upload exam paper
router.post('/', (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      console.error('Upload error:', err);
      return res.status(400).json({ success: false, error: err.message });
    }
    
    try {
      const { subject, semester, year, uploadedBy } = req.body;
      
      // Check for uploaded file
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file uploaded' });
      }
      
      // Validate required fields
      if (!subject || !semester || !year) {
        // Clean up uploaded file if validation fails
        try {
          fs.unlinkSync(path.join(uploadDir, req.file.filename));
        } catch (cleanupError) {
          console.error('Error cleaning up file:', cleanupError);
        }
        return res.status(400).json({ 
          success: false, 
          error: 'Subject, semester, and year are required' 
        });
      }
      
      const paper = new ExamPaper({
        subject: subject.trim(),
        semester: Number(semester),
        year: Number(year),
        uploadedBy: uploadedBy ? uploadedBy.trim() : 'Anonymous',
        fileName: req.file.filename,
        originalName: req.file.originalname,
        datePosted: new Date()
      });
      
      await paper.save();
      res.status(201).json({
        success: true,
        message: 'Paper uploaded successfully',
        data: paper
      });
    } catch (error) {
      console.error('Database error:', error);
      
      // Clean up uploaded file on error
      if (req.file) {
        try {
          fs.unlinkSync(path.join(uploadDir, req.file.filename));
        } catch (cleanupError) {
          console.error('Error cleaning up file:', cleanupError);
        }
      }
      
      if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map((val) => val.message);
        return res.status(400).json({ success: false, error: messages.join(', ') });
      }
      
      res.status(500).json({ success: false, error: error.message });
    }
  });
});

// GET - Fetch all papers with filtering
router.get('/', async (req, res) => {
  try {
    const { subject, semester, year } = req.query;
    
    // Build filter object
    const filter = {};
    if (subject) filter.subject = subject;
    if (semester) filter.semester = Number(semester);
    if (year) filter.year = Number(year);
    
    const papers = await ExamPaper.find(filter).sort('-datePosted');
    res.json({
      success: true,
      data: papers.map(paper => ({
        ...paper.toObject(),
        fileName: paper.fileName,
        originalName: paper.originalName
      }))
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET - Download exam paper
router.get('/download/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(uploadDir, filename);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }
    
    // Find the paper in database to get original name
    const paper = await ExamPaper.findOne({ fileName: filename });
    const downloadName = paper ? paper.originalName : filename;
    
    // Get file stats
    const stat = fs.statSync(filePath);
    
    // Set headers for download
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    res.setHeader('Content-Length', stat.size);
    
    // Determine content type based on file extension
    const ext = path.extname(filename).toLowerCase();
    switch (ext) {
      case '.pdf':
        res.setHeader('Content-Type', 'application/pdf');
        break;
      case '.doc':
        res.setHeader('Content-Type', 'application/msword');
        break;
      case '.docx':
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        break;
      default:
        res.setHeader('Content-Type', 'application/octet-stream');
    }
    
    // Create read stream and pipe to response
    const readStream = fs.createReadStream(filePath);
    
    readStream.on('error', (err) => {
      console.error('File read error:', err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Download failed' });
      }
    });
    
    readStream.pipe(res);
    
  } catch (error) {
    console.error('Download error:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Download failed' });
    }
  }
});

module.exports = router;