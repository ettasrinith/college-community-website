// routes/examPaperRoute.js
const express = require('express');
const multer = require('multer');
const path = require('path'); // Might be needed for filename parsing
const fs = require('fs'); // Might be needed for cleanup if temp files aren't handled by Cloudinary storage
const ExamPaper = require('../models/ExamPaper');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const router = express.Router();

// --- Cloudinary Configuration ---
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true // Ensure secure URLs
});

// --- Cloudinary Storage for PDFs only ---
// This configuration tells Multer to use Cloudinary storage directly
const cloudinaryStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => { // Use async function for params
    return {
      folder: 'exam-papers', // Specific folder for Exam Papers
      // format: 'pdf', // Often not needed for 'raw', let Cloudinary handle
      resource_type: 'raw', // Correct type for PDFs
      // public_id can be customized if needed, otherwise Cloudinary generates
      // public_id: `paper-${Date.now()}-${file.originalname.split('.')[0]}`,
    };
  },
});
// --- End Cloudinary Configuration ---

// --- File Filter (PDFs only) ---
const fileFilter = (req, file, cb) => {
  // Strictly allow only PDFs for exam papers
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    // Pass a more specific error message
    cb(new Error('Only PDF files are allowed for exam papers'), false);
  }
};
// --- End File Filter ---

// --- Multer Middleware using Cloudinary Storage ---
// Configure Multer to use Cloudinary storage and the PDF filter
const upload = multer({
  storage: cloudinaryStorage, // Use Cloudinary storage defined above
  fileFilter: fileFilter,    // Use the strict PDF filter
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
}).single('file'); // Expect a single file input named 'file'
// --- End Multer Middleware ---

// --- POST - Upload Paper (PDF only to Cloudinary) ---
router.post('/', (req, res) => {
  // Invoke the Multer middleware
  upload(req, res, async (err) => {
    // Handle Multer errors (e.g., file size, filter)
    if (err instanceof multer.MulterError) {
      console.error('[Multer Error - ExamPaper Upload]:', err);
      return res.status(400).json({ success: false, error: `Upload Error: ${err.message}` });
    } else if (err) {
      // Handle other errors from fileFilter
      console.error('[File Filter Error - ExamPaper Upload]:', err);
      return res.status(400).json({ success: false, error: err.message });
    }

    try {
      const { subject, semester, year, uploadedBy, postedByEmail } = req.body;

      // Validate required fields and presence of uploaded file
      if (!subject || !semester || !year || !req.file) {
        // Multer should have ensured req.file exists if it passed the filter,
        // but double-checking doesn't hurt.
        const missingFields = [];
        if (!subject) missingFields.push('subject');
        if (!semester) missingFields.push('semester');
        if (!year) missingFields.push('year');
        // req.file check is implicit in the filter, but good for clarity
        if (!req.file) missingFields.push('file');

        return res.status(400).json({
          success: false,
          error: `Missing required fields: ${missingFields.join(', ')}`
        });
      }

      // --- Extract Cloudinary Data ---
      // After successful upload via multer-storage-cloudinary,
      // req.file contains the Cloudinary response details.
      // console.log("Cloudinary Upload Result:", req.file); // Debug log

      // The full, secure URL to access the uploaded PDF on Cloudinary
      const cloudinaryUrl = req.file.path; // Or req.file.secure_url

      // The public ID assigned by Cloudinary, needed for deletion
      const cloudinaryPublicId = req.file.filename; // Or req.file.public_id depending on version

      // --- Prepare Data for Database ---
      const fileData = {
        subject: subject.trim(),
        semester: Number(semester),
        year: Number(year),
        uploadedBy: uploadedBy?.trim() || 'Anonymous',
        postedByEmail: postedByEmail?.trim() || '',
        // Store the Cloudinary URL for access/download
        fileName: cloudinaryUrl,
        // Store the original name for user display/download
        originalName: req.file.originalname,
        // Indicate it's stored on Cloudinary
        fileType: 'pdf', // Assuming only PDFs now
        // Store the public ID for deletion
        cloudinaryId: cloudinaryPublicId,
        datePosted: new Date()
      };

      // --- Save to Database ---
      const paper = new ExamPaper(fileData);
      await paper.save();

      // --- Respond with Success ---
      res.status(201).json({
        success: true,
        message: 'PDF uploaded successfully to Cloudinary',
        paper: paper // Include the saved document details
      });

    } catch (error) {
      console.error('[Database Save Error - ExamPaper]:', error);
      // Note: If an error occurs here, the file *is already uploaded* to Cloudinary.
      // Depending on requirements, you might attempt to delete it from Cloudinary here,
      // but that requires the cloudinaryPublicId, which should ideally be available
      // if we got past the upload step. However, passing complex state back from
      // Multer's callback to this catch block can be tricky.
      // A more robust cleanup might involve storing the public_id temporarily
      // or using Cloudinary's upload response more directly within the Multer callback.
      // For now, we log the DB error.
      res.status(500).json({ success: false, error: `Database Error: ${error.message}` });
    }
  });
});
// --- End POST Route ---

// --- GET - Download Paper (Redirect to Cloudinary) ---
// This route fetches the record from the DB and redirects the user to the Cloudinary URL
// which handles the download, potentially using the original filename.
router.get('/download/:id', async (req, res) => {
  try {
    const paper = await ExamPaper.findById(req.params.id);

    if (!paper) {
      return res.status(404).json({ success: false, error: 'Exam paper record not found' });
    }

    // Ensure the file is marked as being on Cloudinary and has a URL
    if (paper.fileType !== 'pdf' || !paper.fileName) {
       // Handle cases where fileType might be wrong or URL missing, though unlikely if logic is sound
       return res.status(400).json({ success: false, error: 'File not available for download (wrong type or missing URL)' });
    }

    // Option 1: Simple Redirect (Browser handles download)
    // res.redirect(paper.fileName);

    // Option 2: Redirect with Cloudinary's 'download' parameter for better UX
    // This tells Cloudinary to prompt for download with the original name
    const downloadUrl = `${paper.fileName}${paper.fileName.includes('?') ? '&' : '?'}download=${encodeURIComponent(paper.originalName)}`;
    res.redirect(downloadUrl);

    // Option 3: Generate a signed download URL (useful for private/authenticated downloads)
    // Requires setting up signed URLs in Cloudinary and potentially passing auth tokens
    /*
    const signedUrl = cloudinary.url(paper.cloudinaryId, {
        resource_type: 'raw',
        attachment: true, // Force download
        filename: paper.originalName // Suggest original name
        // sign_url: true // Enable signing if needed
    });
    res.redirect(signedUrl);
    */

  } catch (error) {
    console.error('[Download Error - ExamPaper]:', error);
    // Differentiate between 404 (not found) and 500 (server error) if possible
    res.status(500).json({ success: false, error: `Download failed: ${error.message}` });
  }
});
// --- End GET Download Route ---

// --- DELETE - Delete an Exam Paper (Remove DB record and Cloudinary file) ---
router.delete('/:id', async (req, res) => {
  try {
    const paper = await ExamPaper.findById(req.params.id);

    if (!paper) {
      return res.status(404).json({ success: false, error: 'Exam paper record not found' });
    }

    // --- Delete File from Cloudinary ---
    // Check if it's marked as a PDF and has a Cloudinary ID
    if (paper.fileType === 'pdf' && paper.cloudinaryId) {
      try {
        // Use the stored public ID and specify resource_type 'raw' for PDFs
        const destroyResult = await cloudinary.uploader.destroy(paper.cloudinaryId, { resource_type: 'raw' });

        if (destroyResult.result === 'ok') {
          console.log(`[Cloudinary Delete Success] Public ID: ${paper.cloudinaryId}`);
        } else {
          // Log warning if Cloudinary reports an issue (e.g., file already deleted)
          console.warn(`[Cloudinary Delete Warning] Public ID: ${paper.cloudinaryId}, Result: ${destroyResult.result}`);
        }
        // Continue deleting DB record even if Cloudinary reports a warning
      } catch (cloudinaryDeleteErr) {
        // Log Cloudinary specific errors but decide if it should fail the whole operation
        console.error('[Cloudinary Delete Error]:', cloudinaryDeleteErr);
        // Option 1: Fail the delete if Cloudinary fails
        // return res.status(500).json({ success: false, error: 'Failed to delete file from Cloudinary storage.' });
        // Option 2: Log error but proceed to delete DB record (might leave orphaned file)
        // Proceeding with deletion of DB record...
      }
    }
    // Note: If fileType wasn't 'pdf' or cloudinaryId was missing, we skip Cloudinary deletion.
    // This handles potential inconsistencies or future changes.

    // --- Delete Database Record ---
    await paper.deleteOne(); // Use deleteOne() instead of deprecated remove()

    // --- Respond with Success ---
    res.json({ success: true, message: 'Exam paper record and associated file deleted successfully' });

  } catch (err) {
    console.error('[Delete Error - ExamPaper]:', err);
    res.status(500).json({ success: false, error: `Delete failed: ${err.message}` });
  }
});
// --- End DELETE Route ---

// --- GET - Fetch Papers (No changes needed for Cloudinary integration) ---
// This route simply fetches records from the database. The `fileName` field now contains the Cloudinary URL.
router.get('/', async (req, res) => {
  try {
    const { subject, semester, year } = req.query;
    const filter = {};
    if (subject) filter.subject = subject;
    if (semester) filter.semester = Number(semester);
    if (year) filter.year = Number(year);

    const papers = await ExamPaper.find(filter).sort('-datePosted');
    res.json({ success: true, data: papers }); // papers[i].fileName is the Cloudinary URL
  } catch (err) {
    console.error('[Fetch Papers Error - ExamPaper]:', err);
    res.status(500).json({ success: false, error: `Failed to fetch papers: ${err.message}` });
  }
});
// --- End GET Papers Route ---

module.exports = router;
