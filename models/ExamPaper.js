const mongoose = require('mongoose');

const examPaperSchema = new mongoose.Schema({
  subject: {
    type: String,
    required: [true, 'Subject is required'],
    trim: true
  },
  semester: {
    type: Number,
    required: [true, 'Semester is required'],
    min: 1,
    max: 8
  },
  year: {
    type: Number,
    required: [true, 'Year is required'],
    min: 2000,
    max: new Date().getFullYear()
  },
  uploadedBy: {
    type: String,
    default: 'Anonymous',
    trim: true
  },
  postedByEmail: {
    type: String,
    default: '',
    trim: true
  },
  fileName: {
    type: String,
    required: [true, 'File name is required']
  },
  originalName: {
    type: String,
    required: [true, 'Original file name is required']
  },
  fileType: {
    type: String,
    enum: ['pdf', 'other'],
    required: true
  },
  cloudinaryId: {
    type: String,
    default: null
  },
  datePosted: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

examPaperSchema.index({ subject: 1, semester: 1, year: 1 });
examPaperSchema.index({ datePosted: -1 });

module.exports = mongoose.model('ExamPaper', examPaperSchema);
