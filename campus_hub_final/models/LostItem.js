// models/LostItem.js
const mongoose = require('mongoose');

const LostItemSchema = new mongoose.Schema({
  name: String,
  description: String,
  location: String,
  contact: String,
  type: String, // 'lost' or 'found'
  imageUrl: String,
  date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('LostItem', LostItemSchema);