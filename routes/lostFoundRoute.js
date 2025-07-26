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
        folder: 'college-community/lostfound', // Single folder path
        allowed_formats: ['jpg', 'jpeg', 'png', 'pdf'],
        resource_type: 'auto', // 'auto' handles images and 'raw' files like PDFs
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
        // Log the actual structure provided by multer-storage-cloudinary
        console.log('[DEBUG] Cloudinary File Object (req.files.image[0]):', req.files?.image?.[0] || 'No image uploaded');

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

            // --- FIX: Use the URL provided by Cloudinary/Multer ---
            // req.files.image[0].path is the full, secure URL provided by Cloudinary
            let imageUrl = null;
            let imagePublicId = null; // Store public_id for potential deletion

            if (req.files && req.files.image && req.files.image[0]) {
                 const cloudinaryFile = req.files.image[0];
                 imageUrl = cloudinaryFile.path || cloudinaryFile.secure_url; // Use path or secure_url (both should work)
                 imagePublicId = cloudinaryFile.filename; // Cloudinary storage usually puts the public_id here
                 // Alternative if filename isn't the public_id: imagePublicId = cloudinaryFile.public_id;
                 // Log for verification
                 log(`[Cloudinary Upload Success] Public ID: ${imagePublicId}, URL: ${imageUrl}`);
            }
            // --- End FIX ---

            const itemData = {
                name,
                description,
                location,
                contact,
                type,
                date: date || new Date(),
                imageUrl, // Use the full Cloudinary URL
                imagePublicId, // Store public_id for deletion (optional but recommended)
                postedBy,
                postedByEmail
            };

            const item = new LostItem(itemData);
            await item.save();
            // Update log message to reflect the full URL
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
    // Ensure req.user exists and is authenticated (middleware should handle this)
    if (!req.user || !req.user._id) {
         return res.status(401).json({ error: 'Authentication required.' });
    }

    try {
        const item = await LostItem.findById(req.params.id);

        if (!item) {
            return res.status(404).json({ error: 'Item not found' });
        }

        // Check if current user is the owner (Compare using the correct field)
        // Assuming item.postedByEmail and req.user.email are the correct fields to compare
        // OR item.postedBy (ObjectId) and req.user._id (ObjectId)
        // Based on your previous code, it seems you were comparing ObjectIds.
        // Make sure req.user._id is an ObjectId or convert item.postedBy.toString()
        if (item.postedBy.toString() !== req.user._id.toString()) {
             return res.status(403).json({ error: 'Not authorized to delete this item' });
        }

        // --- FIX: Delete image from Cloudinary using the stored public_id ---
        if (item.imagePublicId) { // Use the stored public_id
            try {
                // Determine resource type for Cloudinary deletion based on URL or stored info
                // A more robust way is to store resource_type during upload if needed,
                // but often checking the URL suffix or assuming 'image'/'raw' works.
                // Cloudinary treats PDFs as 'raw' by default with auto resource_type during upload.
                const isPdf = item.imageUrl && (item.imageUrl.endsWith('.pdf') || item.imagePublicId.includes('.pdf')); // Basic check
                const resource_type = isPdf ? 'raw' : 'image';

                const destroyResult = await cloudinary.uploader.destroy(item.imagePublicId, { resource_type: resource_type });
                if (destroyResult.result === 'ok') {
                   log(`[Cloudinary Delete Success] Public ID: ${item.imagePublicId}`);
                } else {
                   log(`[Cloudinary Delete Warning] Result for ${item.imagePublicId}: ${destroyResult.result || 'Unknown'}`);
                }
            } catch (cloudinaryDeleteErr) {
                console.error('Error deleting image from Cloudinary:', cloudinaryDeleteErr);
                log(`[Cloudinary Delete Error] Failed to delete ${item.imagePublicId}: ${cloudinaryDeleteErr.message}`);
                // Decide if this failure should cause the whole delete operation to fail or just log
                // return res.status(500).json({ error: 'Item deleted from DB, but failed to delete image from Cloudinary.' });
            }
        }
        // --- End FIX ---

        // Delete the item from the database
        await LostItem.findByIdAndDelete(req.params.id);
        res.json({ message: 'Item deleted successfully' });
    } catch (err) {
        console.error('[Delete Item Error]', err);
        log(`[Delete Item Error] ${err.message}`);
        res.status(500).json({ error: 'Failed to delete item' });
    }
});

// Error handling middleware
router.use((err, req, res, next) => {
    const errorMsg = `[Route Error] ${err.message}`;
    log(errorMsg);
    console.error('[Router Error]', err); // Log full error for debugging
    res.status(500).json({ error: 'Internal server error in lostfound route' });
});

module.exports = router;

// Debug logging
console.log('[DEBUG] lostFoundRoute.js module exported');
