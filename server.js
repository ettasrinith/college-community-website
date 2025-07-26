const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const passport = require('passport');
const MongoStore = require('connect-mongo');
require('dotenv').config();

// Initialize app
const app = express();

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

// Ensure announce directories exist
const announceDirs = ['announce', 'announce/pdfs', 'announce/images'];
announceDirs.forEach(dir => {
    const dirPath = path.join(__dirname, dir);
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
});

// FIXED: Session configuration with proper settings
app.use(session({
    secret: process.env.SESSION_SECRET || 'your_secret_key_change_this_in_production',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ 
        mongoUrl: process.env.MONGO_URI,
        ttl: 14 * 24 * 60 * 60, // = 14 days
        touchAfter: 24 * 3600 // lazy session update
    }),
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days (increased from 1 day)
        secure: false, // FIXED: Set to false for development, true only for HTTPS in production
        httpOnly: true,
        sameSite: 'lax' // ADDED: Important for cross-site requests
    },
    name: 'sessionId' // ADDED: Custom session name
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// ADDED: Debug middleware to log session info
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

// Serve static files
app.use(express.static(path.join(__dirname, '.')));
app.use('/exampapers', express.static(path.join(__dirname, 'public/exampapers')));
app.use('/sell/images', express.static(path.join(__dirname, 'sell/images')));
app.use('/announce', express.static(path.join(__dirname, 'announce')));

// Routes
app.use('/auth', require('./routes/auth'));

// Import other routes
const lostFoundRoute = require('./routes/lostFoundRoute');
const examPaperRoute = require('./routes/examPaperRoute');
const marketplaceRoute = require('./routes/marketplaceRoute');
const announcementsRoute = require('./routes/announcementRoute');

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

// Ensure logs directory exists
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}
