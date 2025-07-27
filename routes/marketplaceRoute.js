const express = require('express');
const MarketplaceItem = require('../models/MarketplaceItem');
const multer = require('multer');
const path = require('path');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const router = express.Router();

// Cloudinary Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

// Cloudinary Storage for Images
const cloudinaryStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    return {
      folder: 'marketplace-items',
      allowed_formats: ['jpg', 'jpeg', 'png'],
      transformation: [{ width: 800, height: 600, crop: 'limit' }],
      public_id: `item-${Date.now()}-${path.parse(file.originalname).name}`
    };
  }
});

// Multer Middleware with Cloudinary
const upload = multer({
  storage: cloudinaryStorage,
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only JPEG/PNG images are allowed (max 5MB)'));
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// POST: Create new marketplace item
router.post('/', upload.single('image'), async (req, res) => {
  try {
    const {
      itemName,
      itemDescription,
      itemPrice,
      details,
      contact,
      itemCategory,
      postedBy,
      postedByEmail
    } = req.body;

    if (!itemName || !itemPrice || !contact || !postedBy || !postedByEmail) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    const itemData = {
      itemName,
      itemDescription,
      itemPrice: parseFloat(itemPrice),
      details,
      contact,
      itemCategory,
      postedBy,
      postedByEmail,
      imageUrl: req.file ? req.file.path : null
    };

    const item = new MarketplaceItem(itemData);
    await item.save();

    res.status(201).json({
      success: true,
      message: 'Item created successfully',
      data: item
    });

  } catch (error) {
    console.error('[Marketplace Create Error]:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET: Fetch all marketplace items
router.get('/', async (req, res) => {
  try {
    const items = await MarketplaceItem.find().sort('-createdAt');
    res.json({
      success: true,
      data: items
    });
  } catch (error) {
    console.error('[Marketplace Fetch Error]:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch items'
    });
  }
});

// DELETE: Delete marketplace item
router.delete('/:id', async (req, res) => {
  try {
    const item = await MarketplaceItem.findById(req.params.id);
    
    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Item not found'
      });
    }

    // Delete image from Cloudinary if exists
    if (item.imageUrl) {
      try {
        const publicId = item.imageUrl.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(`marketplace-items/${publicId}`);
      } catch (cloudinaryErr) {
        console.error('[Cloudinary Delete Error]:', cloudinaryErr);
      }
    }

    await item.deleteOne();

    res.json({
      success: true,
      message: 'Item deleted successfully'
    });

  } catch (error) {
    console.error('[Marketplace Delete Error]:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete item'
    });
  }
});

module.exports = router;
