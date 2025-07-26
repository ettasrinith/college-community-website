const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const LostItem = require('../models/LostItem');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// Configure logging
const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}
const logStream = fs.createWriteStream(path.join(logDir, 'lostFound.log'), { flags: 'a' });

const log = (message) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    logStream.write(logMessage);
    console.log(logMessage.trim());
};

// Configure Cloudinary storage for lost and found
const storage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: 'college-community/lostfound',
        allowed_formats: ['jpg', 'jpeg', 'png', 'pdf'],
        resource_type: 'auto',
    },
});

const upload = multer({ 
    storage,
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|pdf/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);
        if (extname && mimetype) {
            cb(null, true);
        } else {
            cb(new Error('Only JPEG, PNG, and PDF files are allowed'), false);
        }
    },
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB
}).fields([
    { name: 'image', maxCount: 1 },
    { name: 'postedBy' },
    { name: 'postedByEmail' },
]);

// Debug logging
console.log('[DEBUG] lostFoundRoute.js loaded');

router.post('/', (req, res) => {
    console.log('[DEBUG] POST / route hit');
    log('[DEBUG] POST / route hit');

    upload(req, res, async (err) => {
        if (err) {
            const errorMsg = `[Multer Error] ${err.message}`;
            log(errorMsg);
            return res.status(400).json({ error: err.message });
        }

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

            const imageFile = req.files.image ? req.files.image[0].path : null; // Use .path instead of .filename

            const itemData = {
                name,
                description,
                location,
                contact,
                type,
                date: date || new Date(),
                imageUrl: imageFile, // Store the full Cloudinary URL
                postedBy,
                postedByEmail
            };

            const item = new LostItem(itemData);
            await item.save();

            log(`[Item Saved] ID: ${item._id}, PostedBy: ${postedBy}, ImageUrl: ${item.imageUrl}`);
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

// GET items by user email
router.get('/user/:email', async (req, res) => {
    try {
        const items = await LostItem.find({ postedByEmail: req.params.email }).sort({ date: -1 });
        res.json(items);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch user items' });
    }
});

// DELETE an item (only allowed by owner)
router.delete('/:id', async (req, res) => {
    try {
        const item = await LostItem.findById(req.params.id);
        
        if (!item) {
            return res.status(404).json({ error: 'Item not found' });
        }

        if (item.postedBy.toString() !== req.user._id.toString()) {
            return res.status(403).json({ error: 'Not authorized to delete this item' });
        }

        // Delete image from Cloudinary if it exists
        if (item.imageUrl) {
            const publicId = `college-community/lostfound/${path.basename(item.imageUrl, path.extname(item.imageUrl))}`;
            await cloudinary.uploader.destroy(publicId, { resource_type: item.imageUrl.endsWith('.pdf') ? 'raw' : 'image' });
        }

        await LostItem.findByIdAndDelete(req.params.id);
        
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
