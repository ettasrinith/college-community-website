const express = require('express');
const multer = require('multer');
const ExamPaper = require('../models/ExamPaper');
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
    resource_type: 'raw', // Keep as raw for PDFs
    public_id: `${Date.now()}-${file.originalname.replace(/\.[^/.]+$/, "")}`, // Remove extension, Cloudinary will handle it
    use_filename: true,
    unique_filename: false,
  }),
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') cb(null, true);
  else cb(new Error('Only PDF files are allowed for exam papers'), false);
};

const upload = multer({
  storage: cloudinaryStorage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
}).single('file');

const router = express.Router();

// UPLOAD exam paper (PDF)
router.post('/', (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ success: false, error: err.message });

    try {
      const { subject, semester, year, uploadedBy, postedByEmail } = req.body;
      if (!subject || !semester || !year || !req.file)
        return res.status(400).json({ success: false, error: 'Missing required fields' });

      // Get the correct public_id from Cloudinary
      const cloudinaryId = req.file.public_id;

      const paper = new ExamPaper({
        subject: subject.trim(),
        semester: Number(semester),
        year: Number(year),
        uploadedBy: uploadedBy?.trim() || 'Anonymous',
        postedByEmail: postedByEmail?.trim() || '',
        fileType: 'pdf',
        cloudinaryId: cloudinaryId,
        fileName: req.file.secure_url,       // Cloudinary secure URL
        originalName: req.file.originalname, // User's upload name
        datePosted: new Date(),
      });
      await paper.save();
      return res.status(201).json({ success: true, message: 'PDF uploaded', paper });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Database Error: ' + error.message });
    }
  });
});

// DOWNLOAD exam paper (PDF) - FIXED VERSION
router.get('/download/:id', async (req, res) => {
  try {
    const paper = await ExamPaper.findById(req.params.id);
    if (!paper || !paper.cloudinaryId || paper.fileType !== 'pdf')
      return res.status(404).json({ success: false, error: 'File not found' });

    // Get the secure download URL from Cloudinary
    const downloadUrl = cloudinary.url(paper.cloudinaryId, {
      resource_type: 'raw',
      secure: true,
      flags: 'attachment', // This forces download
      // Add the original filename with .pdf extension
      public_id: paper.cloudinaryId,
    });

    // Set proper headers for PDF download
    const filename = paper.originalName.endsWith('.pdf') 
      ? paper.originalName 
      : `${paper.originalName}.pdf`;
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    // Redirect to the Cloudinary URL
    return res.redirect(downloadUrl);
  } catch (error) {
    console.error('[Exam Download Error]', error);
    res.status(500).json({ success: false, error: 'Download failed.' });
  }
});

// Alternative download method using proxy (if the above doesn't work)
router.get('/download-proxy/:id', async (req, res) => {
  try {
    const paper = await ExamPaper.findById(req.params.id);
    if (!paper || !paper.cloudinaryId || paper.fileType !== 'pdf')
      return res.status(404).json({ success: false, error: 'File not found' });

    const https = require('https');
    const downloadUrl = cloudinary.url(paper.cloudinaryId, {
      resource_type: 'raw',
      secure: true,
    });

    const filename = paper.originalName.endsWith('.pdf') 
      ? paper.originalName 
      : `${paper.originalName}.pdf`;

    // Set headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Proxy the file through your server
    https.get(downloadUrl, (cloudinaryRes) => {
      cloudinaryRes.pipe(res);
    }).on('error', (err) => {
      console.error('Download proxy error:', err);
      res.status(500).json({ success: false, error: 'Download failed' });
    });

  } catch (error) {
    console.error('[Exam Download Proxy Error]', error);
    res.status(500).json({ success: false, error: 'Download failed.' });
  }
});

// LIST exam papers
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
    res.status(500).json({ success: false, error: `Failed to fetch papers: ${err.message}` });
  }
});

// DELETE exam paper (and from Cloudinary)
router.delete('/:id', async (req, res) => {
  try {
    const paper = await ExamPaper.findById(req.params.id);
    if (!paper) return res.status(404).json({ success: false, error: 'Not found' });

    if (paper.fileType === 'pdf' && paper.cloudinaryId) {
      try {
        await cloudinary.uploader.destroy(paper.cloudinaryId, { resource_type: 'raw' });
      } catch (err) {
        console.error('Cloudinary delete error:', err);
        // Continue with database deletion even if Cloudinary delete fails
      }
    }

    await paper.deleteOne();
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Delete failed.' });
  }
});

module.exports = router;
