const express = require('express');
const passport = require('passport');
const router = express.Router();
const User = require('../models/user');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
require('dotenv').config();

// Google OAuth Strategy
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL
}, async (accessToken, refreshToken, profile, done) => { // REMOVED req parameter
    try {
        const email = profile.emails[0].value;
        console.log('Google OAuth attempt:', email);

        let user = await User.findOne({ 
            $or: [
                { googleId: profile.id },
                { email: email }
            ]
        });

        if (!user) {
            console.log('Creating new user:', email);
            user = await User.create({
                googleId: profile.id,
                name: profile.displayName,
                email: email,
                role: 'user'
            });
        } else if (!user.googleId) {
            // Update existing user with Google ID
            user.googleId = profile.id;
            await user.save();
        } else {
            console.log('Existing user found:', email);
        }

        console.log('OAuth success for user:', user.email); // ADDED: Better logging
        return done(null, user);
    } catch (err) {
        console.error('OAuth error:', err);
        return done(err, null);
    }
}));

// FIXED: Serialization with better error handling
passport.serializeUser((user, done) => {
    console.log('Serializing user:', user.email);
    done(null, user._id); // Use _id instead of id for MongoDB
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        console.log('Deserializing user:', user ? user.email : 'not found');
        done(null, user);
    } catch (err) {
        console.error('Deserialization error:', err);
        done(err, null);
    }
});

// Auth Routes
router.get('/google', passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account'
}));

router.get('/google/callback',
    passport.authenticate('google', {
        failureRedirect: '/login?error=auth_failed',
        failureFlash: false // CHANGED: Set to false to avoid issues
    }),
    (req, res) => {
        console.log('OAuth callback success for user:', req.user.email);
        console.log('Session after OAuth:', req.sessionID);
        
        // ADDED: Ensure session is saved before redirect
        req.session.save((err) => {
            if (err) {
                console.error('Session save error:', err);
                return res.redirect('/login?error=session_error');
            }
            console.log('Session saved, redirecting to index.html');
            res.redirect('/index.html');
        });
    }
);

router.get('/logout', (req, res) => {
    const userEmail = req.user ? req.user.email : 'unknown';
    console.log('Logout attempt for user:', userEmail);
    
    req.logout((err) => {
        if (err) {
            console.error('Logout error:', err);
            return res.status(500).json({ error: 'Logout failed' });
        }
        
        req.session.destroy((err) => {
            if (err) {
                console.error('Session destroy error:', err);
                return res.status(500).json({ error: 'Session destroy failed' });
            }
            
            console.log('User logged out successfully:', userEmail);
            res.clearCookie('sessionId'); // Clear the session cookie
            res.redirect('/login');
        });
    });
});

// ENHANCED: Check authentication status with better logging
router.get('/status', (req, res) => {
    const authStatus = {
        authenticated: req.isAuthenticated(),
        user: req.user || null,
        sessionID: req.sessionID
    };
    
    console.log('Auth status check:', {
        authenticated: authStatus.authenticated,
        userEmail: authStatus.user ? authStatus.user.email : 'none',
        sessionID: authStatus.sessionID
    });
    
    res.json(authStatus);
});

module.exports = router;
