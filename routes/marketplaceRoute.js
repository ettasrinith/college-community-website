const express = require('express');

const MarketplaceItem = require('../models/MarketplaceItem');

const multer = require('multer');

const cloudinary = require('cloudinary').v2;

const { CloudinaryStorage } = require('multer-storage-cloudinary');

const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

// ======================================================
// CLOUDINARY CONFIG
// ======================================================

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
});

// ======================================================
// CLOUDINARY STORAGE
// ======================================================

const storage = new CloudinaryStorage({

    cloudinary,

    params: async (req, file) => {

        return {

            folder: 'marketplace-items',

            allowed_formats: [
                'jpg',
                'jpeg',
                'png'
            ],

            transformation: [
                {
                    width: 800,
                    height: 800,
                    crop: 'limit'
                }
            ],

            public_id: `marketplace-${Date.now()}`
        };
    }
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
            'image/png'
        ];

        if (allowedMimeTypes.includes(file.mimetype)) {

            cb(null, true);

        } else {

            cb(
                new Error(
                    'Only JPG, JPEG, and PNG files are allowed'
                ),
                false
            );
        }
    },

    limits: {
        fileSize: 5 * 1024 * 1024
    }
});

// ======================================================
// POST CREATE MARKETPLACE ITEM
// ======================================================

router.post(
    '/',
    requireAuth,
    upload.single('image'),

    async (req, res) => {

        try {

            const {
                itemName,
                itemDescription,
                itemPrice,
                details,
                contact,
                itemCategory
            } = req.body;

            // USER FROM SESSION
            const postedBy = req.user._id;

            const postedByEmail = req.user.email;

            // VALIDATION
            if (
                !itemName ||
                !itemDescription ||
                !itemPrice ||
                !contact
            ) {

                return res.status(400).json({
                    error:
                        'Missing required fields'
                });
            }

            // IMAGE
            let imageUrl = null;

            let cloudinaryPublicId = null;

            if (req.file) {

                imageUrl = req.file.path;

                cloudinaryPublicId =
                    req.file.filename;
            }

            // CREATE ITEM
            const itemData = {

                itemName,

                itemDescription,

                itemPrice: parseFloat(itemPrice),

                details,

                contact,

                itemCategory,

                postedBy,

                postedByEmail,

                imageUrl,

                cloudinaryPublicId
            };

            const item = new MarketplaceItem(
                itemData
            );

            await item.save();

            res.status(201).json(item);

        } catch (err) {

            console.error(
                '[Marketplace POST Error]',
                err
            );

            // CLEANUP FAILED UPLOAD
            if (
                req.file &&
                req.file.filename
            ) {

                try {

                    await cloudinary.uploader.destroy(
                        req.file.filename
                    );

                } catch (cleanupErr) {

                    console.error(
                        '[Cloudinary Cleanup Error]',
                        cleanupErr
                    );
                }
            }

            res.status(400).json({
                error: err.message
            });
        }
    }
);

// ======================================================
// DELETE MARKETPLACE ITEM
// ======================================================

router.delete(
    '/:id',
    requireAuth,

    async (req, res) => {

        try {

            const item =
                await MarketplaceItem.findById(
                    req.params.id
                );

            if (!item) {

                return res.status(404).json({
                    error: 'Item not found'
                });
            }

            // OWNER CHECK
            if (
                item.postedByEmail !==
                req.user.email
            ) {

                return res.status(403).json({
                    error:
                        'Not authorized to delete this item'
                });
            }

            // DELETE CLOUDINARY IMAGE
            if (item.cloudinaryPublicId) {

                try {

                    await cloudinary.uploader.destroy(
                        item.cloudinaryPublicId
                    );

                } catch (cloudinaryErr) {

                    console.error(
                        '[Cloudinary Delete Error]',
                        cloudinaryErr
                    );
                }
            }

            // DELETE ITEM
            await item.deleteOne();

            res.json({
                message:
                    'Item deleted successfully'
            });

        } catch (err) {

            console.error(
                '[Marketplace DELETE Error]',
                err
            );

            res.status(500).json({
                error: err.message
            });
        }
    }
);

// ======================================================
// GET ALL MARKETPLACE ITEMS
// ======================================================

router.get('/', async (req, res) => {

    try {

        const items =
            await MarketplaceItem.find()
                .sort({ createdAt: -1 });

        res.json(items);

    } catch (err) {

        console.error(
            '[Marketplace GET Error]',
            err
        );

        res.status(500).json({
            error: err.message
        });
    }
});

module.exports = router;