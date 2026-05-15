const express = require('express');

const passport = require('passport');

const router = express.Router();

const User = require('../models/user');

const GoogleStrategy =
    require('passport-google-oauth20').Strategy;

require('dotenv').config();

// ======================================================
// GOOGLE OAUTH STRATEGY
// ======================================================

passport.use(

    new GoogleStrategy(

        {
            clientID:
                process.env.GOOGLE_CLIENT_ID,

            clientSecret:
                process.env.GOOGLE_CLIENT_SECRET,

            callbackURL:
                process.env.GOOGLE_CALLBACK_URL
        },

        async (
            accessToken,
            refreshToken,
            profile,
            done
        ) => {

            try {

                // SAFETY CHECK
                if (
                    !profile ||
                    !profile.emails ||
                    !profile.emails.length
                ) {

                    return done(
                        new Error(
                            'No email found from Google'
                        ),
                        null
                    );
                }

                const email =
                    profile.emails[0].value
                        .trim()
                        .toLowerCase();

                // DEV LOGGING ONLY
                if (
                    process.env.NODE_ENV !==
                    'production'
                ) {

                    console.log(
                        '[OAuth Attempt]',
                        email
                    );
                }

                // FIND USER
                let user =
                    await User.findOne({

                        $or: [
                            {
                                googleId:
                                    profile.id
                            },
                            {
                                email
                            }
                        ]
                    });

                // CREATE USER
                if (!user) {

                    user =
                        await User.create({

                            googleId:
                                profile.id,

                            name:
                                profile.displayName,

                            email,

                            role: 'user'
                        });

                    if (
                        process.env.NODE_ENV !==
                        'production'
                    ) {

                        console.log(
                            '[New User Created]',
                            email
                        );
                    }

                } else if (!user.googleId) {

                    // LINK EXISTING ACCOUNT
                    user.googleId =
                        profile.id;

                    await user.save();

                    if (
                        process.env.NODE_ENV !==
                        'production'
                    ) {

                        console.log(
                            '[Google Linked]',
                            email
                        );
                    }
                }

                return done(null, user);

            } catch (err) {

                console.error(
                    '[OAuth Error]',
                    err
                );

                return done(err, null);
            }
        }
    )
);

// ======================================================
// SERIALIZE USER
// ======================================================

passport.serializeUser(
    (user, done) => {

        done(null, user._id);
    }
);

// ======================================================
// DESERIALIZE USER
// ======================================================

passport.deserializeUser(
    async (id, done) => {

        try {

            const user =
                await User.findById(id);

            done(null, user);

        } catch (err) {

            console.error(
                '[Deserialize Error]',
                err
            );

            done(err, null);
        }
    }
);

// ======================================================
// GOOGLE LOGIN ROUTE
// ======================================================

router.get(
    '/google',

    passport.authenticate(
        'google',
        {
            scope: ['profile', 'email'],
            prompt: 'select_account'
        }
    )
);

// ======================================================
// GOOGLE CALLBACK
// ======================================================

router.get(
    '/google/callback',

    passport.authenticate(
        'google',
        {
            failureRedirect:
                '/login?error=auth_failed',

            failureFlash: false
        }
    ),

    (req, res) => {

        // SAVE SESSION BEFORE REDIRECT
        req.session.save((err) => {

            if (err) {

                console.error(
                    '[Session Save Error]',
                    err
                );

                return res.redirect(
                    '/login?error=session_error'
                );
            }

            res.redirect('/index.html');
        });
    }
);

// ======================================================
// LOGOUT
// ======================================================

router.get(
    '/logout',

    (req, res) => {

        req.logout((err) => {

            if (err) {

                console.error(
                    '[Logout Error]',
                    err
                );

                return res.status(500).json({
                    error: 'Logout failed'
                });
            }

            req.session.destroy((err) => {

                if (err) {

                    console.error(
                        '[Session Destroy Error]',
                        err
                    );

                    return res.status(500).json({
                        error:
                            'Session destroy failed'
                    });
                }

                // CLEAR COOKIE
                res.clearCookie('sessionId');

                res.redirect('/login');
            });
        });
    }
);

// ======================================================
// AUTH STATUS
// ======================================================

router.get(
    '/status',

    (req, res) => {

        const authStatus = {

            authenticated:
                req.isAuthenticated(),

            user: req.user
                ? {
                    _id:
                        req.user._id,

                    name:
                        req.user.name,

                    email:
                        req.user.email,

                    role:
                        req.user.role
                }
                : null
        };

        // DEV LOGGING ONLY
        if (
            process.env.NODE_ENV !==
            'production'
        ) {

            console.log(
                '[Auth Status]',
                {
                    authenticated:
                        authStatus.authenticated,

                    user:
                        authStatus.user
                            ? authStatus.user.email
                            : 'none'
                }
            );
        }

        res.json(authStatus);
    }
);

module.exports = router;
