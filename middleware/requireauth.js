// middleware/requireAuth.js

function requireAuth(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }

    return res.status(401).json({
        error: 'Authentication required'
    });
}

module.exports = requireAuth;