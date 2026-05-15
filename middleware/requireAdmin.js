// middleware/requireAdmin.js

const admins = require('../config/admins.json');

function requireAdmin(req, res, next) {

    if (!req.isAuthenticated()) {
        return res.status(401).json({
            error: 'Authentication required'
        });
    }

    if (!admins.includes(req.user.email)) {
        return res.status(403).json({
            error: 'Admin access required'
        });
    }

    next();
}

module.exports = requireAdmin;