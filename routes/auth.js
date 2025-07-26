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
}, async (req, accessToken, refreshToken, profile, done) => {
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

        return done(null, user);
    } catch (err) {
        console.error('OAuth error:', err);
        return done(err);
    }
}));

// Serialization
passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (err) {
        done(err);
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
        failureFlash: true
    }),
    (req, res) => {
        console.log('OAuth success, redirecting to index.html');
        // Successful authentication, redirect to index.html
        res.redirect('/index.html');
    }
);

router.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            console.error('Logout error:', err);
            return res.redirect('/');
        }
        req.session.destroy(() => {
            console.log('User logged out');
            res.redirect('/login');
        });
    });
});

// Check authentication status
router.get('/status', (req, res) => {
    res.json({ 
        authenticated: req.isAuthenticated(),
        user: req.user 
    });
});

module.exports = router;
