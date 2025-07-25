const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const LostItem = require('../models/LostItem');

// Debug logging
console.log('[DEBUG] lostFoundRoute.js loaded');

// Configure logging
const logStream = fs.createWriteStream(path.join(__dirname, '../logs/lostFound.log'), { flags: 'a' });

const log = (message) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  logStream.write(logMessage);
  console.log(logMessage.trim());
};

// Upload directory - FIXED: Changed from 'Uploads' to 'uploads' to match static middleware
const uploadDir = path.join(__dirname, '../uploads/images/');
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
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const filetypes = /jpeg|jpg|png|pdf/;
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = filetypes.test(file.mimetype);
  if (extname && mimetype) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, and PDF files are allowed'), false);
  }
};
const upload = multer({ 
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
}).fields([
  { name: 'image', maxCount: 1 },
  { name: 'postedBy' },
  { name: 'postedByEmail' },
]);


router.post('/', (req, res) => {
  console.log('[DEBUG] POST / route hit');
  log('[DEBUG] POST / route hit');

  upload(req, res, async (err) => {
    if (err) {
      const errorMsg = `[Multer Error] ${err.message}`;
      log(errorMsg);
      return res.status(400).json({ error: err.message });
    }

    // ✅ POST-Fix Debug Entries
    console.log('[DEBUG] Request body:', req.body);
    console.log('[DEBUG] Files:', req.files);

    try {
      const {
        name,
        description,
        location,
        contact,
        type,
        date,
        postedBy,
        postedByEmail
      } = req.body;

      if (!name || !description || !location || !contact || !type || !date || !postedBy || !postedByEmail) {
        const errorMsg = `[Validation Error] Missing field(s): ${JSON.stringify(req.body)}`;
        log(errorMsg);
        return res.status(400).json({ error: errorMsg });
      }

      const imageFile = req.files.image ? req.files.image[0].filename : null;

      const itemData = {
        name,
        description,
        location,
        contact,
        type,
        date: date || new Date(),
        imageUrl: imageFile,
        postedBy,
        postedByEmail
      };

      const item = new LostItem(itemData);
      await item.save();

      log(`[Item Saved] ID: ${item._id}, PostedBy: ${postedBy}`);
      res.status(201).json(item);

    } catch (err) {
      log(`[Item Save Error] ${err.message}`);
      res.status(400).json({ error: err.message });
    }
  });
});



// GET: Fetch all items
router.get('/', async (req, res) => {
  console.log('[DEBUG] GET / route hit');
  log('[DEBUG] GET / route hit');
  
  try {
    const items = await LostItem.find().sort({ date: -1 });
    log(`[Items Fetched] Count: ${items.length}`);
    res.json(items);
  } catch (err) {
    const errorMsg = `[Error fetching items] ${err.message}`;
    log(errorMsg);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

// NEW: GET items by user email
router.get('/user/:email', async (req, res) => {
  try {
    const items = await LostItem.find({ postedByEmail: req.params.email }).sort({ date: -1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user items' });
  }
});

// NEW: DELETE an item (only allowed by owner)
router.delete('/:id', async (req, res) => {
  try {
    // Find the item first to verify ownership
    const item = await LostItem.findById(req.params.id);
    
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Check if current user is the owner
    if (item.postedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to delete this item' });
    }

    // Delete the item
    await LostItem.findByIdAndDelete(req.params.id);
    
    // Optionally delete the associated image file
    if (item.imageUrl) {
      const filePath = path.join(uploadDir, item.imageUrl);
      fs.unlink(filePath, (err) => {
        if (err) console.error('Error deleting image file:', err);
      });
    }

    res.json({ message: 'Item deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

// Error handling middleware
router.use((err, req, res, next) => {
  const errorMsg = `[Route Error] ${err.message}`;
  log(errorMsg);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = router;

// Debug logging
console.log('[DEBUG] lostFoundRoute.js module exported');