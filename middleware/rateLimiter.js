/**
 * Rate Limiter Middleware
 * Limita peticiones por IP para prevenir abusos
 */

const requests = new Map();

const WINDOW_MS = 60 * 1000; // 1 minuto
const MAX_REQUESTS = 15;     // max 15 peticiones por ventana

/**
 * Limpia entradas expiradas periódicamente
 */
setInterval(() => {
    const now = Date.now();
    for (const [ip, data] of requests) {
        if (now - data.windowStart > WINDOW_MS * 2) {
            requests.delete(ip);
        }
    }
}, WINDOW_MS * 2);

/**
 * Middleware de rate limiting por IP
 */
function rateLimiter(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();

    if (!requests.has(ip)) {
        requests.set(ip, { count: 1, windowStart: now });
        return next();
    }

    const data = requests.get(ip);

    // Reset window if expired
    if (now - data.windowStart > WINDOW_MS) {
        data.count = 1;
        data.windowStart = now;
        return next();
    }

    data.count++;

    if (data.count > MAX_REQUESTS) {
        const retryAfter = Math.ceil((data.windowStart + WINDOW_MS - now) / 1000);
        res.set('Retry-After', String(retryAfter));
        return res.status(429).json({
            error: 'Demasiadas solicitudes. Por favor espere antes de intentar nuevamente.',
            retryAfter,
        });
    }

    next();
}

module.exports = { rateLimiter };
