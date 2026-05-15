const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const admins = require('../config/admins.json');

const router = express.Router();

// Check if logged-in user is admin
router.get('/is-admin', requireAuth, (req, res) => {

  try {

    const isAdmin = admins.includes(
      req.user.email
    );

    return res.json({
      success: true,
      isAdmin
    });

  } catch (err) {

    return res.status(500).json({
      success: false,
      error: 'Admin check failed'
    });
  }
});

module.exports = router;
