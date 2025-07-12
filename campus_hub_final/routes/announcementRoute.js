const express = require('express');
const Announcement = require('../models/Announcement');

const router = express.Router();

router.post('/', async (req, res) => {
  const announcement = new Announcement(req.body);
  try {
    await announcement.save();
    res.status(201).send(announcement);
  } catch (err) {
    res.status(400).send(err);
  }
});

router.get('/', async (req, res) => {
  try {
    const announcements = await Announcement.find();
    res.send(announcements);
  } catch (err) {
    res.status(500).send(err);
  }
});

module.exports = router;