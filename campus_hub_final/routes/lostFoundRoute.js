const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const LostItem = require('../models/LostItem');

// Configure logging
const logStream = fs.createWriteStream(path.join(__dirname, '../logs/lostFound.log'), { flags: 'a' });

const log = (message) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  logStream.write(logMessage);
  console.log(logMessage.trim());
};

// Ensure upload directory exists - CHANGED TO public/exampapers
const uploadDir = path.join(__dirname, '../public/exampapers/');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  log(`Created upload directory: ${uploadDir}`);
}

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Added filename sanitization for security
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9-_.]/g, '');
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}-${sanitizedName}`;
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Only image and PDF files are allowed!'), false);
  }
};

const upload = multer({ 
  storage, 
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
}).single('image');

// POST: Upload item
router.post('/upload', (req, res) => {
  upload(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      const errorMsg = `[Multer Error] ${err.message}`;
      log(errorMsg);
      return res.status(400).json({ error: errorMsg });
    } else if (err) {
      const errorMsg = `[Upload Error] ${err.message}`;
      log(errorMsg);
      return res.status(500).json({ error: errorMsg });
    }

    if (!req.file) {
      const errorMsg = 'No file was uploaded';
      log(errorMsg);
      return res.status(400).json({ error: errorMsg });
    }

    const { name, description, location, contact, type, date } = req.body;

    try {
      const newItem = new LostItem({
        name,
        description,
        location,
        contact,
        type,
        date,
        imageUrl: req.file.filename
      });

      await newItem.save();
      
      const successMsg = `[Item Saved] ID: ${newItem._id}, Type: ${type}, Name: ${name}`;
      log(successMsg);
      
      res.status(201).json({ 
        message: 'Item uploaded successfully', 
        item: {
          ...newItem.toObject(),
          // Updated path to match new location
          imageUrl: `/exampapers/${req.file.filename}`
        }
      });
    } catch (error) {
      const errorMsg = `[Database Error] ${error.message}`;
      log(errorMsg);
      
      // Clean up uploaded file if save failed
      if (req.file) {
        fs.unlink(path.join(uploadDir, req.file.filename), () => {});
      }
      
      res.status(500).json({ error: 'Database save failed' });
    }
  });
});

// GET: Fetch all items
router.get('/', async (req, res) => {
  try {
    const items = await LostItem.find().sort({ date: -1 });
    log(`[Items Fetched] Count: ${items.length}`);
    res.json(items);
  } catch (err) {
    const errorMsg = `[Fetch Error] ${err.message}`;
    log(errorMsg);
    res.status(500).json({ error: 'Could not fetch items' });
  }
});

// Error handling middleware
router.use((err, req, res, next) => {
  const errorMsg = `[Route Error] ${err.message}`;
  log(errorMsg);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = router;