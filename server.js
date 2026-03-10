/**
 * Circulante Search Engine - Server Entry Point
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const searchRoutes = require('./routes/search');
const { crawlSite } = require('./services/crawler');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api', searchRoutes);

// Catch-all: serve index.html for SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('[Server] Unhandled error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor.' });
});

// Start server (only when running locally, not on Vercel)
if (!process.env.VERCEL) {
    app.listen(PORT, async () => {
        console.log(`\n🔍 Circulante Search Engine running on http://localhost:${PORT}\n`);

        // Initial crawl on startup
        try {
            console.log('[Server] Initiating initial site crawl...');
            await crawlSite();
            console.log('[Server] Initial crawl complete. Ready for searches.\n');
        } catch (err) {
            console.error('[Server] Initial crawl failed:', err.message);
            console.log('[Server] Will attempt crawl on first search request.\n');
        }
    });
}

module.exports = app;
