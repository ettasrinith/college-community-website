const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ExamPaper = require('../models/ExamPaper');

const router = express.Router();

const uploadDir = path.join(__dirname, '../public/exampapers');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
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
  }
}).single('file');

// POST - Upload paper
router.post('/', (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ success: false, error: err.message });

    try {
      const { subject, semester, year, uploadedBy, postedByEmail } = req.body;

      if (!subject || !semester || !year || !req.file) {
        if (req.file) {
          fs.unlinkSync(path.join(uploadDir, req.file.filename));
        }
        return res.status(400).json({ success: false, error: 'Missing required fields or file' });
      }

      const paper = new ExamPaper({
        subject: subject.trim(),
        semester: Number(semester),
        year: Number(year),
        uploadedBy: uploadedBy?.trim() || 'Anonymous',
        postedByEmail: postedByEmail?.trim() || '',
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
      if (req.file) {
        try {
          fs.unlinkSync(path.join(uploadDir, req.file.filename));
        } catch (_) {}
      }
      res.status(500).json({ success: false, error: error.message });
    }
  });
});

// GET - Fetch papers with filters
router.get('/', async (req, res) => {
  try {
    const { subject, semester, year } = req.query;
    const filter = {};
    if (subject) filter.subject = subject;
    if (semester) filter.semester = Number(semester);
    if (year) filter.year = Number(year);

    const papers = await ExamPaper.find(filter).sort('-datePosted');
    res.json({
      success: true,
      data: papers.map(p => ({
        ...p.toObject(),
        fileName: p.fileName,
        originalName: p.originalName
      }))
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
// DELETE - Delete an exam paper and its associated file
router.delete('/:id', async (req, res) => {
  try {
    const paper = await ExamPaper.findById(req.params.id);
    if (!paper) return res.status(404).json({ success: false, error: 'Paper not found' });

    // Delete the associated file
    const filePath = path.join(uploadDir, paper.fileName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await paper.deleteOne();
    res.json({ success: true, message: 'Paper deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET - Download paper
router.get('/download/:filename', async (req, res) => {
  try {
    const filePath = path.join(uploadDir, req.params.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }

    const paper = await ExamPaper.findOne({ fileName: req.params.filename });
    const downloadName = paper?.originalName || req.params.filename;

    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    res.setHeader('Content-Type', 'application/octet-stream');

    const readStream = fs.createReadStream(filePath);
    readStream.on('error', () => {
      res.status(500).json({ success: false, error: 'Download failed' });
    });
    readStream.pipe(res);
  } catch {
    res.status(500).json({ success: false, error: 'Download failed' });
  }
});

module.exports = router;
