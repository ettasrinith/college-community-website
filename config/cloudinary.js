const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'college-community',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'pdf'], // ✅ Add 'pdf'
    resource_type: 'auto', // Required for non-image files
  },
});

module.exports = { cloudinary, storage };