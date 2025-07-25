const express = require('express');
const MarketplaceItem = require('../models/MarketplaceItem');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../sell/images');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only JPEG/PNG images are allowed'));
  },
  limits: { fileSize: 5 * 1024 * 1024 }
});

// POST: Create a new marketplace item with image
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

    if (!postedBy || !postedByEmail) {
      return res.status(400).send({ error: 'Missing postedBy or postedByEmail fields' });
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
      imageUrl: req.file ? `/sell/images/${req.file.filename}` : null
    };

    const item = new MarketplaceItem(itemData);
    await item.save();
    res.status(201).send(item);
  } catch (err) {
    res.status(400).send({ error: err.message });
  }
});
// DELETE: Delete a marketplace item and its associated image
router.delete('/:id', async (req, res) => {
  try {
    const item = await MarketplaceItem.findById(req.params.id);
    if (!item) return res.status(404).send({ error: 'Item not found' });

    // Remove image file if it exists
    if (item.imageUrl) {
      const imagePath = path.join(__dirname, '..', item.imageUrl);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    await item.deleteOne();
    res.send({ message: 'Item deleted successfully' });
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

// GET: Fetch all marketplace items
router.get('/', async (req, res) => {
  try {
    const items = await MarketplaceItem.find();
    res.send(items);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

module.exports = router;
