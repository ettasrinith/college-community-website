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
  imageUrl: String,
  date: { 
    type: Date, 
    default: Date.now 
  },
   postedByEmail: {
    type: String,
    required: true
  },
postedBy: {
  type: mongoose.Schema.Types.ObjectId, // ensure this matches format of _id
  required: true,
  ref: 'User'
}

});

module.exports = mongoose.model('LostItem', LostItemSchema);
