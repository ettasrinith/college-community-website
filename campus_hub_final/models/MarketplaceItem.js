const mongoose = require('mongoose');

const marketplaceItemSchema = new mongoose.Schema({
  itemName: String,
  itemDescription: String,
  itemPrice: Number,
  details: String,
  itemCategory: String,
  imageUrl: String, // Added for image path
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('MarketplaceItem', marketplaceItemSchema);