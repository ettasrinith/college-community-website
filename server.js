const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const passport = require('passport');
const MongoStore = require('connect-mongo');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
require('dotenv').config();

// Initialize app
const app = express();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

// Create Cloudinary storage engine for all file types
const cloudinaryStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: (req, file) => {
      // Determine folder based on route
      if (req.baseUrl.includes('papers')) return 'exam-papers';
      if (req.baseUrl.includes('announcements')) return 'announcements';
      if (req.baseUrl.includes('marketplace')) return 'marketplace';
      if (req.baseUrl.includes('lostfound')) return 'lostfound';
      return 'misc';
    },
    resource_type: 'auto', // Automatically detect resource type
    allowed_formats: ['jpg', 'png', 'jpeg', 'gif', 'pdf', 'doc', 'docx'],
    public_id: (req, file) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      return `${path.parse(file.originalname).name}-${uniqueSuffix}`;
    }
  }
});

// Configure multer for Cloudinary uploads
const upload = multer({ 
  storage: cloudinaryStorage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'your_secret_key_change_this_in_production',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ 
        mongoUrl: process.env.MONGO_URI,
        ttl: 14 * 24 * 60 * 60,
        touchAfter: 24 * 3600
    }),
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7,
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'lax'
    },
    name: 'sessionId'
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Debug middleware
app.use((req, res, next) => {
    console.log('Session Debug:', {
        sessionID: req.sessionID,
        authenticated: req.isAuthenticated(),
        user: req.user ? req.user.email : 'none',
        path: req.path
    });
    next();
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (only for frontend assets)
app.use(express.static(path.join(__dirname, '.')));

// Routes
app.use('/auth', require('./routes/auth'));

// Import routes with Cloudinary support
const lostFoundRoute = require('./routes/lostFoundRoute')(upload);
const examPaperRoute = require('./routes/examPaperRoute')(upload);
const marketplaceRoute = require('./routes/marketplaceRoute')(upload);
const announcementsRoute = require('./routes/announcementRoute')(upload);

app.use('/api/marketplace', marketplaceRoute);
app.use('/api/lostfound', lostFoundRoute);
app.use('/api/papers', examPaperRoute);
app.use('/api/announcements', announcementsRoute);

// HTML routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/dashboard', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// Authentication middleware
function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/login');
}

// Global error handler
app.use((err, req, res, next) => {
    console.error('[Global Error]', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
