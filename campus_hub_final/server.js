const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

// Initialize app
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from root directory for HTML and favicon
app.use(express.static(path.join(__dirname, '.')));
// Serve static files for uploads
app.use('/exampapers', express.static(path.join(__dirname, 'public/exampapers')));
app.use('/sell/images', express.static(path.join(__dirname, 'sell/images')));

// Import routes
const lostFoundRoute = require('./routes/lostFoundRoute');
const examPaperRoute = require('./routes/examPaperRoute');
const marketplaceRoute = require('./routes/marketplaceRoute');

// Routes
app.use('/api/marketplace', marketplaceRoute); // Mount first to avoid interference
app.use('/api/lostfound', lostFoundRoute); // Changed to /api/lostfound for clarity
app.use('/api/papers', examPaperRoute);

// Serve HTML files
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/exams.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'exams.html'));
});
app.get('/lost-found.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'lost-found.html'));
});
app.get('/announcements.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'announcements.html'));
});

// Ensure logs directory exists
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/lostfound', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Global Error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Logs being written to: ${path.join(__dirname, 'logs')}`);
});