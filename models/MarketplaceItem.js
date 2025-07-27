// models/MarketplaceItem.js
const mongoose = require('mongoose');

const marketplaceItemSchema = new mongoose.Schema({
  itemName: {
    type: String,
    required: true,
    trim: true
  },
  itemDescription: {
    type: String,
    required: true,
    trim: true
  },
  itemPrice: {
    type: Number,
    required: true,
    min: 0
  },
  details: {
    type: String,
    trim: true
  },
  contact: {
    type: String,
    required: true,
    trim: true
  },
  itemCategory: {
    type: String,
    required: true,
    trim: true
  },
  imageUrl: {
    type: String, // Cloudinary URL
    default: null
  },
  cloudinaryPublicId: {
    type: String, // Cloudinary public ID for deletion
    default: null
  },
  postedBy: {
    type: String,
    required: true
  },
  postedByEmail: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  views: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field before saving
marketplaceItemSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Add indexes for better query performance
marketplaceItemSchema.index({ itemCategory: 1 });
marketplaceItemSchema.index({ postedBy: 1 });
marketplaceItemSchema.index({ createdAt: -1 });
marketplaceItemSchema.index({ isActive: 1 });

module.exports = mongoose.model('MarketplaceItem', marketplaceItemSchema);
