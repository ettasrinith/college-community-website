
const express = require('express');
const router = express.Router();

const multer = require('multer');
const path = require('path');
const fs = require('fs');

const LostItem = require('../models/LostItem');

const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;

const requireAuth = require('../middleware/requireAuth');

// ======================================================
// CLOUDINARY CONFIG
// ======================================================

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
});

// ======================================================
// LOGGING
// ======================================================

const logDir = path.join(__dirname, '../logs');

if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

const logStream = fs.createWriteStream(
    path.join(logDir, 'lostFound.log'),
    { flags: 'a' }
);

const log = (message) => {

    const timestamp = new Date().toISOString();

    const logMessage = `[${timestamp}] ${message}\n`;

    logStream.write(logMessage);

    console.log(logMessage.trim());
};

// ======================================================
// CLOUDINARY STORAGE
// ======================================================

const storage = new CloudinaryStorage({
    cloudinary,

    params: async (req, file) => {

        return {
            folder: 'college-community/lostfound',
            allowed_formats: ['jpg', 'jpeg', 'png', 'pdf'],
            resource_type: 'auto',
            public_id: `lostfound-${Date.now()}`
        };
    },
});

// ======================================================
// MULTER
// ======================================================

const upload = multer({

    storage,

    fileFilter: (req, file, cb) => {

        const allowedMimeTypes = [
            'image/jpeg',
            'image/jpg',
            'image/png',
            'application/pdf'
        ];

        if (allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(
                new Error(
                    'Only JPEG, PNG, and PDF files are allowed'
                ),
                false
            );
        }
    },

    limits: {
        fileSize: 5 * 1024 * 1024
    }

}).fields([
    { name: 'image', maxCount: 1 }
]);

// ======================================================
// DEBUG
// ======================================================

console.log('[DEBUG] lostFoundRoute.js loaded');

// ======================================================
// POST ITEM
// ======================================================

router.post(
    '/',
    requireAuth,

    (req, res) => {

        console.log('[DEBUG] POST / route hit');

        log('[DEBUG] POST / route hit');

        upload(req, res, async (err) => {

            if (err) {

                const errorMsg = `[Multer Error] ${err.message}`;

                log(errorMsg);

                return res.status(400).json({
                    error: err.message
                });
            }

            try {

                const {
                    name,
                    description,
                    location,
                    contact,
                    type,
                    date
                } = req.body;

                // USER COMES FROM SESSION
                const postedBy = req.user._id;
                const postedByEmail = req.user.email;

                // VALIDATION
                if (
                    !name ||
                    !description ||
                    !location ||
                    !contact ||
                    !type ||
                    !date
                ) {

                    const errorMsg =
                        '[Validation Error] Missing required fields';

                    log(errorMsg);

                    return res.status(400).json({
                        error: errorMsg
                    });
                }

                let imageUrl = null;
                let imagePublicId = null;

                // FILE UPLOAD
                if (
                    req.files &&
                    req.files.image &&
                    req.files.image[0]
                ) {

                    const cloudinaryFile =
                        req.files.image[0];

                    imageUrl =
                        cloudinaryFile.path ||
                        cloudinaryFile.secure_url;

                    imagePublicId =
                        cloudinaryFile.filename;

                    log(
                        `[Cloudinary Upload Success] Public ID: ${imagePublicId}, URL: ${imageUrl}`
                    );
                }

                // CREATE ITEM
                const item = new LostItem({

                    name,
                    description,
                    location,
                    contact,
                    type,

                    date: date || new Date(),

                    imageUrl,
                    imagePublicId,

                    postedBy,
                    postedByEmail
                });

                await item.save();

                log(
                    `[Item Saved] ID: ${item._id}, PostedBy: ${postedByEmail}`
                );

                res.status(201).json(item);

            } catch (err) {

                console.error('[Item Save Error]', err);

                log(`[Item Save Error] ${err.message}`);

                res.status(400).json({
                    error: err.message
                });
            }
        });
    }
);

// ======================================================
// GET ALL ITEMS
// ======================================================

router.get('/', async (req, res) => {

    console.log('[DEBUG] GET / route hit');

    log('[DEBUG] GET / route hit');

    try {

        const items = await LostItem
            .find()
            .sort({ date: -1 });

        log(`[Items Fetched] Count: ${items.length}`);

        res.json(items);

    } catch (err) {

        const errorMsg =
            `[Error fetching items] ${err.message}`;

        log(errorMsg);

        res.status(500).json({
            error: 'Failed to fetch items'
        });
    }
});

// ======================================================
// GET AUTHENTICATED USER ITEMS
// ======================================================

router.get('/my-items', requireAuth, async (req, res) => {

    try {

        const items = await LostItem
            .find({
                postedByEmail: req.user.email
            })
            .sort({ date: -1 });

        res.json({
            success: true,
            items
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            error: 'Failed to fetch items'
        });
    }
});

// ======================================================
// DELETE ITEM
// ======================================================

router.delete(
    '/:id',
    requireAuth,

    async (req, res) => {

        try {

            const item = await LostItem.findById(
                req.params.id
            );

            if (!item) {

                return res.status(404).json({
                    error: 'Item not found'
                });
            }

            // OWNER CHECK
            if (
                item.postedBy.toString() !==
                req.user._id.toString()
            ) {

                return res.status(403).json({
                    error:
                        'Not authorized to delete this item'
                });
            }

            // DELETE CLOUDINARY FILE
            if (item.imagePublicId) {

                try {

                    const isPdf =
                        item.imageUrl &&
                        item.imageUrl.endsWith('.pdf');

                    const resource_type =
                        isPdf ? 'raw' : 'image';

                    const destroyResult =
                        await cloudinary.uploader.destroy(
                            item.imagePublicId,
                            {
                                resource_type
                            }
                        );

                    log(
                        `[Cloudinary Delete] ${JSON.stringify(destroyResult)}`
                    );

                } catch (cloudinaryDeleteErr) {

                    console.error(
                        'Error deleting Cloudinary file:',
                        cloudinaryDeleteErr
                    );

                    log(
                        `[Cloudinary Delete Error] ${cloudinaryDeleteErr.message}`
                    );
                }
            }

            // DELETE ITEM
            await LostItem.findByIdAndDelete(
                req.params.id
            );

            res.json({
                message: 'Item deleted successfully'
            });

        } catch (err) {

            console.error('[Delete Item Error]', err);

            log(`[Delete Item Error] ${err.message}`);

            res.status(500).json({
                error: 'Failed to delete item'
            });
        }
    }
);

// ======================================================
// ERROR HANDLER
// ======================================================

router.use((err, req, res, next) => {

    const errorMsg = `[Route Error] ${err.message}`;

    log(errorMsg);

    console.error('[Router Error]', err);

    res.status(500).json({
        error: 'Internal server error in lostfound route'
    });
});

module.exports = router;

// ======================================================
// DEBUG
// ======================================================

console.log('[DEBUG] lostFoundRoute.js module exported');

