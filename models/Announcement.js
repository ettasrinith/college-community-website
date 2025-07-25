const mongoose = require('mongoose');

const AnnouncementSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: String,
  postedByName: String,
  postedByEmail: { type: String, required: true },
  fileUrl: String, // URL for PDF/image file
  datePosted: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Announcement', AnnouncementSchema);
