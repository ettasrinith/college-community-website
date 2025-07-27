const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: String,
  postedByName: { type: String, required: true },
  postedByEmail: { type: String, required: true },
  fileUrl: String,             // URL from Cloudinary
  cloudinaryPublicId: String,  // Cloudinary Public ID for deletion
  datePosted: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Announcement', announcementSchema);
