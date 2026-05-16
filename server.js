const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const passport = require('passport');
const MongoStore = require('connect-mongo');
const helmet = require('helmet');
const adminRoute = require('./routes/adminRoute');
require('dotenv').config();
console.log('MONGO_URI exists:', !!process.env.MONGO_URI);
console.log('SESSION_SECRET exists:', !!process.env.SESSION_SECRET);
console.log('GOOGLE_CLIENT_ID exists:', !!process.env.GOOGLE_CLIENT_ID);
console.log('GOOGLE_CLIENT_SECRET exists:', !!process.env.GOOGLE_CLIENT_SECRET);
console.log('CLOUDINARY_CLOUD_NAME exists:', !!process.env.CLOUDINARY_CLOUD_NAME);
// Initialize app
const app = express();

// Trust first proxy (Render, Heroku, etc.) — required for secure cookies behind reverse proxy
app.set('trust proxy', 1);

// Security headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: [
                "'self'",
                "'unsafe-inline'",
                'https://cdnjs.cloudflare.com'
            ],
            fontSrc: [
                "'self'",
                'https://cdnjs.cloudflare.com',
                'data:'
            ],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'", 'https://accounts.google.com']
        }
    }
}));
// MongoDB connection
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.error('MongoDB Error:', err));

// Removed legacy announce directory creation (announcements now use Cloudinary).
// Leaving note for developers: if you re-enable local announce storage, reintroduce folder creation here.

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET,

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

// Debug middleware (development only)
if (process.env.NODE_ENV !== 'production') {

    app.use((req, res, next) => {

        console.log('Session Debug:', {
            authenticated: req.isAuthenticated(),
            user: req.user ? req.user.email : 'none',
            path: req.path
        });

        next();
    });
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/auth', require('./routes/auth'));
app.use('/api/admin', adminRoute);
app.use('/api/marketplace', require('./routes/marketplaceRoute'));
app.use('/api/lostfound', require('./routes/lostFoundRoute'));
app.use('/api/papers', require('./routes/examPaperRoute'));
app.use('/api/announcements', require('./routes/announcementRoute'));

// Home page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Login page
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Dashboard page
app.get('/dashboard', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Auth middleware
function isAuthenticated(req, res, next) {

    if (req.isAuthenticated()) {
        return next();
    }

    res.redirect('/login');
}

// Global error handler
app.use((err, req, res, next) => {

    console.error('[Global Error]', err);

    res.status(500).json({
        error: 'Internal server error'
    });
});

// Ensure logs directory exists
const logDir = path.join(__dirname, 'logs');

if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// Start server
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
