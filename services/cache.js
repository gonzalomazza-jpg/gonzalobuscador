/**
 * Sistema de Caché LRU en memoria
 * Para optimizar búsquedas repetidas y evitar recrawling innecesario
 */

class LRUCache {
    constructor(maxSize = 100, ttlMs = 30 * 60 * 1000) {
        this.maxSize = maxSize;
        this.ttlMs = ttlMs;
        this.cache = new Map();
    }

    /**
     * Obtiene un valor del caché si existe y no ha expirado
     */
    get(key) {
        const entry = this.cache.get(key);
        if (!entry) return null;

        // Check TTL
        if (Date.now() - entry.timestamp > this.ttlMs) {
            this.cache.delete(key);
            return null;
        }

        // Move to front (most recently used)
        this.cache.delete(key);
        this.cache.set(key, entry);

        return entry.value;
    }

    /**
     * Almacena un valor en el caché
     */
    set(key, value) {
        // Delete existing entry if present
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }

        // Evict oldest entry if at capacity
        if (this.cache.size >= this.maxSize) {
            const oldestKey = this.cache.keys().next().value;
            this.cache.delete(oldestKey);
        }

        this.cache.set(key, {
            value,
            timestamp: Date.now(),
        });
    }

    /**
     * Elimina una entrada del caché
     */
    delete(key) {
        return this.cache.delete(key);
    }

    /**
     * Limpia todo el caché
     */
    clear() {
        this.cache.clear();
    }

    /**
     * Número de entradas en el caché
     */
    get size() {
        return this.cache.size;
    }

    /**
     * Obtiene estadísticas del caché
     */
    stats() {
        let expired = 0;
        const now = Date.now();
        for (const [, entry] of this.cache) {
            if (now - entry.timestamp > this.ttlMs) expired++;
        }
        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            expired,
            ttlMs: this.ttlMs,
        };
    }
}

// Singleton instances
const searchCache = new LRUCache(100, 30 * 60 * 1000); // 30 min TTL
const crawlCache = new LRUCache(200, 60 * 60 * 1000);  // 1 hour TTL

module.exports = { LRUCache, searchCache, crawlCache };
