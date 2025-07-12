// models/Announcement.js
const mongoose = require('mongoose');

const AnnouncementSchema = new mongoose.Schema({
  title: String,
  content: String,
  postedBy: String,
  imageUrl: String, // Add this field
  datePosted: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Announcement', AnnouncementSchema);