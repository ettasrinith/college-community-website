const mongoose = require('mongoose');

const marketplaceItemSchema = new mongoose.Schema({
  itemName: String,
  itemDescription: String,
  itemPrice: Number,
  details: String,
  contact: String,
  itemCategory: String,
  imageUrl: String,
  postedBy: {
    type: String,
    required: true
  },
  postedByEmail: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('MarketplaceItem', marketplaceItemSchema);

