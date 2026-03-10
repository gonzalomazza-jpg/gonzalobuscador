/**
 * Crawler / Scraper Module
 * Recorre circulante.es.tl extrayendo contenido de todas las páginas
 */

const cheerio = require('cheerio');
const fetch = require('node-fetch');
const { crawlCache } = require('./cache');

const BASE_URL = 'https://circulante.es.tl';
const IS_SERVERLESS = !!process.env.VERCEL;
const CONCURRENCY = IS_SERVERLESS ? 5 : 2;
const TIMEOUT_MS = IS_SERVERLESS ? 8000 : 15000;
const MAX_RETRIES = IS_SERVERLESS ? 1 : 2;
const CRAWL_DELAY_MS = IS_SERVERLESS ? 200 : 500;

// In-memory page index
let pageIndex = [];
let lastCrawlTime = 0;
let crawlInProgress = false;
let crawlPromise = null;
const CRAWL_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Clasifica una URL en una sección/categoría
 */
function categorizeUrl(url, title) {
    const urlLower = (url + ' ' + title).toLowerCase();

    if (/trauma|fractura|rotula|platillo|clav[ií]cula|hombro|manguito|hallux|kuntscher|clavo|dhs|pie.*equino/i.test(urlLower)) {
        return 'Traumatología';
    }
    if (/neuro|cerebr|craneal|mielom|hematoma.*subdural|derivaci[oó]n/i.test(urlLower)) {
        return 'Neurocirugía';
    }
    if (/lapar|ap[eé]ndice|ves[ií]cula|colon|hemicolect|gastr|esplenect|hepatect|pancreat|intestin|reconstrucci[oó]n/i.test(urlLower)) {
        return 'Cirugía General';
    }
    if (/urol|pr[oó]stata|nefr|hidrocele|fimosis|litiasis|doble.*j|rtu|reimplante.*ureteral|ureteroplas/i.test(urlLower)) {
        return 'Urología';
    }
    if (/ces[aá]rea|legrado|histeroscop|[uú]tero/i.test(urlLower)) {
        return 'Ginecología';
    }
    if (/vascul|aorta|aneurisma|v[aá]rices|f[ií]stula.*arterio/i.test(urlLower)) {
        return 'Cirugía Vascular';
    }
    if (/anestesia|hipertermia|pam|set.*vvc/i.test(urlLower)) {
        return 'Anestesiología';
    }
    if (/mastectom|mama/i.test(urlLower)) {
        return 'Mastología';
    }
    if (/pl[aá]stica/i.test(urlLower)) {
        return 'Cirugía Plástica';
    }
    if (/bocio|tiroid/i.test(urlLower)) {
        return 'Cirugía de Tiroides';
    }
    if (/maxilofacial|am[ií]gdala|tumor.*nasal/i.test(urlLower)) {
        return 'Cabeza y Cuello';
    }
    if (/columna|hernia.*disco|artoscop/i.test(urlLower)) {
        return 'Columna / Artroscopia';
    }
    if (/coloproct|absceso.*perianal|f[ií]stula.*coxigea/i.test(urlLower)) {
        return 'Coloproctología';
    }
    if (/norma|tip|enfermer|procedimiento|calculador|goteo/i.test(urlLower)) {
        return 'Recursos y Tips';
    }
    if (/cat[eé]ter|doble.*luz/i.test(urlLower)) {
        return 'Accesos Venosos';
    }
    if (/contacto/i.test(urlLower)) {
        return 'Contacto';
    }
    if (/inicio/i.test(urlLower)) {
        return 'Inicio';
    }

    return 'General';
}

/**
 * Fetch con timeout y retry
 */
async function fetchWithRetry(url, retries = MAX_RETRIES) {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

            const response = await fetch(url, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'CirculanteSearchBot/1.0 (internal search engine)',
                    'Accept': 'text/html,application/xhtml+xml',
                    'Accept-Language': 'es-ES,es;q=0.9',
                },
            });

            clearTimeout(timeout);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.text();
        } catch (err) {
            if (attempt === retries) {
                console.error(`[Crawler] Failed to fetch ${url} after ${retries + 1} attempts: ${err.message}`);
                return null;
            }
            console.warn(`[Crawler] Retry ${attempt + 1} for ${url}: ${err.message}`);
            await sleep(1000 * (attempt + 1));
        }
    }
    return null;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Extrae todos los links internos de la página
 */
function extractInternalLinks(html, currentUrl) {
    const $ = cheerio.load(html);
    const links = new Set();
    const baseUrl = new URL(BASE_URL);

    $('a[href]').each((_, el) => {
        let href = $(el).attr('href');
        if (!href || href.startsWith('javascript:') || href.startsWith('#')) return;

        try {
            // Resolve relative URLs
            const absoluteUrl = new URL(href, currentUrl || BASE_URL);

            // Only include internal links to .htm pages
            if (absoluteUrl.hostname === baseUrl.hostname && (absoluteUrl.pathname.endsWith('.htm') || absoluteUrl.pathname === '/')) {
                // Remove fragments
                absoluteUrl.hash = '';
                links.add(absoluteUrl.toString());
            }
        } catch (e) {
            // Ignore invalid URLs
        }
    });

    return Array.from(links);
}

/**
 * Parsea una página individual y extrae su contenido
 */
function parsePage(html, url) {
    const $ = cheerio.load(html);

    // Remove scripts, styles, nav duplicates
    $('script, style, noscript, iframe').remove();

    // Get title
    let title = $('title').text().trim();
    if (title.includes(' - ')) {
        title = title.split(' - ')[0].trim();
    }
    // Fallback: try h1 or first heading
    if (!title || title === 'Circulante') {
        const h1 = $('h1').first().text().trim();
        const h2 = $('h2').first().text().trim();
        title = h1 || h2 || url.split('/').pop().replace('.htm', '').replace(/-/g, ' ');
    }

    // Get main content text
    // The site uses es.tl template — content is typically in a specific div
    let contentText = '';

    // Try to get specific content area
    const contentSelectors = [
        '.ws_article', '.article-content', '.content-area',
        '#content', '.ws-content', 'td.auto-style1',
        '.element_text', '.element',
        'article', 'main', '.main-content',
    ];

    for (const selector of contentSelectors) {
        const el = $(selector);
        if (el.length && el.text().trim().length > 50) {
            contentText = el.text().trim();
            break;
        }
    }

    // Fallback: get body text minus navigation
    if (!contentText || contentText.length < 50) {
        $('nav, .navigation, .menu, .sidebar, .footer, header').remove();
        contentText = $('body').text().trim();
    }

    // Clean up text
    contentText = contentText
        .replace(/\s+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    const section = categorizeUrl(url, title);

    return {
        title: decodeURIComponent(title).replace(/%[A-Fa-f0-9]{2}/g, ''),
        content: contentText,
        url,
        section,
        crawledAt: Date.now(),
    };
}

/**
 * Procesa un batch de URLs con concurrencia limitada
 */
async function crawlBatch(urls, concurrency = CONCURRENCY) {
    const results = [];
    const queue = [...urls];

    const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
        while (queue.length > 0) {
            const url = queue.shift();
            if (!url) break;

            // Check cache first
            const cached = crawlCache.get(url);
            if (cached) {
                results.push(cached);
                continue;
            }

            const html = await fetchWithRetry(url);
            if (html) {
                const page = parsePage(html, url);
                if (page.content.length > 20) {
                    results.push(page);
                    crawlCache.set(url, page);
                }
            }

            // Be polite: wait between requests
            await sleep(CRAWL_DELAY_MS);
        }
    });

    await Promise.all(workers);
    return results;
}

/**
 * Crawl completo del sitio
 */
async function crawlSite() {
    // Prevent concurrent crawls
    if (crawlInProgress) {
        console.log('[Crawler] Crawl already in progress, waiting...');
        return crawlPromise;
    }

    // Check if crawl data is still fresh
    if (pageIndex.length > 0 && Date.now() - lastCrawlTime < CRAWL_TTL) {
        console.log('[Crawler] Using cached index (' + pageIndex.length + ' pages)');
        return pageIndex;
    }

    crawlInProgress = true;
    crawlPromise = (async () => {
        try {
            console.log('[Crawler] Starting full site crawl...');
            const startTime = Date.now();

            // Step 1: Fetch homepage and extract links
            const homepageHtml = await fetchWithRetry(BASE_URL);
            if (!homepageHtml) {
                throw new Error('Could not fetch homepage');
            }

            const links = extractInternalLinks(homepageHtml, BASE_URL);
            console.log(`[Crawler] Found ${links.length} internal links`);

            // Step 2: Add homepage itself
            const homepage = parsePage(homepageHtml, BASE_URL);

            // Step 3: Crawl all pages
            const pages = await crawlBatch(links);

            // Combine and deduplicate by URL
            const allPages = [homepage, ...pages];
            const seen = new Set();
            pageIndex = allPages.filter(p => {
                if (seen.has(p.url)) return false;
                seen.add(p.url);
                return true;
            });

            lastCrawlTime = Date.now();
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`[Crawler] Crawl complete: ${pageIndex.length} pages indexed in ${elapsed}s`);

            return pageIndex;
        } catch (err) {
            console.error('[Crawler] Crawl failed:', err.message);
            // Return stale data if available
            if (pageIndex.length > 0) {
                console.log('[Crawler] Using stale index (' + pageIndex.length + ' pages)');
                return pageIndex;
            }
            throw err;
        } finally {
            crawlInProgress = false;
            crawlPromise = null;
        }
    })();

    return crawlPromise;
}

/**
 * Devuelve el índice actual (sin recrawlear)
 */
function getIndex() {
    return pageIndex;
}

/**
 * Estado del crawler
 */
function getCrawlStatus() {
    return {
        pagesIndexed: pageIndex.length,
        lastCrawlTime: lastCrawlTime ? new Date(lastCrawlTime).toISOString() : null,
        crawlInProgress,
        isFresh: Date.now() - lastCrawlTime < CRAWL_TTL,
    };
}

/**
 * Crawlea una única página por URL (on-demand)
 */
async function crawlSinglePage(url) {
    try {
        const html = await fetchWithRetry(url);
        if (!html) return null;

        const page = parsePage(html, url);
        if (page.content.length > 20) {
            // Add to index so future lookups are instant
            pageIndex.push(page);
            crawlCache.set(url, page);
            return page;
        }
        return null;
    } catch (err) {
        console.error(`[Crawler] crawlSinglePage failed for ${url}:`, err.message);
        return null;
    }
}

/**
 * Busca una página específica en el índice por su URL
 */
function getPageByUrl(url) {
    return pageIndex.find(p => p.url === url) || null;
}

module.exports = { crawlSite, getIndex, getCrawlStatus, categorizeUrl, getPageByUrl, crawlSinglePage };
