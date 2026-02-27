/**
 * API Routes - Search
 */

const express = require('express');
const router = express.Router();
const { search } = require('../services/searchEngine');
const { getCrawlStatus, crawlSite, getPageByUrl } = require('../services/crawler');
const { rateLimiter } = require('../middleware/rateLimiter');

/**
 * GET /api/search?q=term
 * Busca coincidencias en el sitio indexado
 */
router.get('/search', rateLimiter, async (req, res) => {
    try {
        const query = req.query.q;

        // Validate input
        if (!query || typeof query !== 'string') {
            return res.status(400).json({
                error: 'Se requiere un término de búsqueda. Use el parámetro "q".',
                example: '/api/search?q=cesárea',
            });
        }

        const trimmed = query.trim();

        if (trimmed.length < 2) {
            return res.status(400).json({
                error: 'El término de búsqueda debe tener al menos 2 caracteres.',
            });
        }

        if (trimmed.length > 200) {
            return res.status(400).json({
                error: 'El término de búsqueda no debe superar los 200 caracteres.',
            });
        }

        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const results = await search(trimmed, { limit });

        res.json({
            success: true,
            ...results,
        });
    } catch (err) {
        console.error('[API] Search error:', err.message);
        res.status(500).json({
            error: 'Error interno al procesar la búsqueda. Intente nuevamente.',
        });
    }
});

/**
 * GET /api/status
 * Estado del crawler y el sistema
 */
router.get('/status', (req, res) => {
    const status = getCrawlStatus();
    res.json({
        success: true,
        crawler: status,
        uptime: process.uptime(),
    });
});

/**
 * POST /api/recrawl
 * Forzar un re-crawl del sitio (protegido por rate limiter)
 */
router.post('/recrawl', rateLimiter, async (req, res) => {
    try {
        await crawlSite();
        const status = getCrawlStatus();
        res.json({
            success: true,
            message: 'Re-crawl completado',
            crawler: status,
        });
    } catch (err) {
        console.error('[API] Recrawl error:', err.message);
        res.status(500).json({
            error: 'Error al recorrer el sitio. Intente más tarde.',
        });
    }
});

/**
 * GET /api/page?url=...
 * Obtiene el contenido completo de una página indexada
 */
router.get('/page', (req, res) => {
    const url = req.query.url;
    if (!url) {
        return res.status(400).json({ error: 'Se requiere el parámetro "url".' });
    }

    const page = getPageByUrl(url);
    if (!page) {
        return res.status(404).json({ error: 'Página no encontrada en el índice.' });
    }

    res.json({
        success: true,
        page: {
            title: page.title,
            content: page.content,
            url: page.url,
            section: page.section,
            crawledAt: page.crawledAt
        }
    });
});

module.exports = router;
