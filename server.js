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
        secure: false,
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

// Removed unused static file serving
// app.use(express.static(path.join(__dirname, '.')));
// app.use('/exampapers', express.static(path.join(__dirname, 'public/exampapers')));
// app.use('/sell/images', express.static(path.join(__dirname, 'sell/images')));
// app.use('/announce', express.static(path.join(__dirname, 'announce')));

// Routes
app.use('/auth', require('./routes/auth'));
app.use('/api/marketplace', require('./routes/marketplaceRoute'));
app.use('/api/lostfound', require('./routes/lostFoundRoute'));
app.use('/api/papers', require('./routes/examPaperRoute'));
app.use('/api/announcements', require('./routes/announcementRoute'));

// HTML routes
//app.get('/', (req, res) => {
   // res.sendFile(path.join(__dirname, 'index.html'));
//});

//app.get('/login', (req, res) => {
    //res.sendFile(path.join(__dirname, 'login.html'));
//});

//app.get('/dashboard', isAuthenticated, (req, res) => {
   // res.sendFile(path.join(__dirname, 'dashboard.html'));
//});

// Auth middleware
function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/login');
}

// Error handler
app.use((err, req, res, next) => {
    console.error('[Global Error]', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server (removed localhost log)
const PORT = process.env.PORT || 3000;
app.listen(PORT);

// Ensure logs directory exists
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}
