// models/LostItem.js
const mongoose = require('mongoose');

const LostItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  location: {
    type: String,
    required: true
  },
  contact: {
    type: String,
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: ['lost', 'found']
  },
  // Updated field name for clarity (still holds the full URL)
  imageUrl: {
    type: String,
    required: false // Make it optional if no image is uploaded
  },
  // New field to store Cloudinary public ID for potential deletion
  imagePublicId: {
    type: String,
    required: false
  },
  date: {
    type: Date,
    default: Date.now
  },
  postedByEmail: {
    type: String,
    required: true
  },
  postedBy: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User'
  }
});

module.exports = mongoose.model('LostItem', LostItemSchema);
