const express = require('express');
const MarketplaceItem = require('../models/MarketplaceItem');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'marketplace-items',
    allowed_formats: ['jpg', 'jpeg', 'png'],
    transformation: [{ width: 800, height: 800, crop: 'limit' }]
  }
});
const upload = multer({ storage });

const router = express.Router();

// POST: Create a new marketplace item with optional Cloudinary image
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

    if (!postedBy || !postedByEmail)
      return res.status(400).send({ error: 'Missing postedBy or postedByEmail fields' });

    const imageUrl = req.file ? req.file.path : null;

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
    };

    const item = new MarketplaceItem(itemData);
    await item.save();
    res.status(201).send(item);
  } catch (err) {
    res.status(400).send({ error: err.message });
  }
});

// DELETE: Remove marketplace item and Cloudinary image
router.delete('/:id', async (req, res) => {
  try {
    const item = await MarketplaceItem.findById(req.params.id);
    if (!item) return res.status(404).send({ error: 'Item not found' });

    if (item.imageUrl) {
      // Extract Cloudinary public_id for deletion
      const matches = item.imageUrl.match(/\/marketplace-items\/([^/.]+)/);
      if (matches && matches[1]) {
        const publicId = 'marketplace-items/' + matches[1];
        try {
          await cloudinary.uploader.destroy(publicId);
        } catch (err) {
          // Ignore Cloudinary errors
        }
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
