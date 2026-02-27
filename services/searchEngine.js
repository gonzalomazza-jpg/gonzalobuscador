/**
 * Search Engine Module
 * Busca coincidencias exactas, parciales y semánticas en el índice crawleado
 */

const { normalize, stem, levenshtein, extractSnippet, getSynonyms, areSynonyms, stemSimilarity } = require('./textUtils');
const { crawlSite, getIndex } = require('./crawler');
const { searchCache } = require('./cache');

/**
 * Ejecuta la búsqueda completa sobre el índice
 */
async function search(query, options = {}) {
    if (!query || query.trim().length === 0) {
        return { results: [], query: '', totalResults: 0, searchTime: 0 };
    }

    const cleanQuery = query.trim();
    const cacheKey = normalize(cleanQuery);

    // Check cache
    const cached = searchCache.get(cacheKey);
    if (cached) {
        console.log(`[Search] Cache hit for "${cleanQuery}"`);
        return { ...cached, fromCache: true };
    }

    const startTime = Date.now();

    // Ensure index is ready
    let index = getIndex();
    if (index.length === 0) {
        console.log('[Search] Index empty, triggering crawl...');
        await crawlSite();
        index = getIndex();
    }

    if (index.length === 0) {
        return { results: [], query: cleanQuery, totalResults: 0, searchTime: 0, error: 'No se pudo indexar el sitio' };
    }

    // Process query
    const normalizedQuery = normalize(cleanQuery);
    const queryWords = normalizedQuery.split(/\s+/).filter(w => w.length > 1);
    const queryStems = queryWords.map(w => stem(w));

    // Collect all synonyms for query words
    const querySynonyms = new Set();
    for (const word of queryWords) {
        const syns = getSynonyms(word);
        for (const syn of syns) querySynonyms.add(syn);
        // Also add synonyms for the stem
        const stemSyns = getSynonyms(stem(word));
        for (const syn of stemSyns) querySynonyms.add(syn);
    }

    const results = [];

    for (const page of index) {
        const normalizedTitle = normalize(page.title);
        const normalizedContent = normalize(page.content);
        const fullText = normalizedTitle + ' ' + normalizedContent;

        let matchType = null;
        let score = 0;
        let matchDetails = [];

        // --- 1. EXACT MATCH ---
        if (fullText.includes(normalizedQuery)) {
            matchType = 'exacta';
            // Count occurrences for scoring
            const regex = new RegExp(escapeRegex(normalizedQuery), 'gi');
            const matches = fullText.match(regex);
            const count = matches ? matches.length : 1;

            // Title match is worth more
            const titleMatch = normalizedTitle.includes(normalizedQuery);
            score = 100 + (count * 5) + (titleMatch ? 50 : 0);
            matchDetails.push(`Coincidencia exacta: "${cleanQuery}" encontrada ${count} vez(es)`);
        }

        // --- 2. PARTIAL MATCH ---
        if (!matchType || matchType !== 'exacta') {
            let wordMatches = 0;
            let fuzzyMatches = 0;
            let partialDetails = [];

            for (let i = 0; i < queryWords.length; i++) {
                const word = queryWords[i];
                const wordStem = queryStems[i];

                if (fullText.includes(word)) {
                    wordMatches++;
                    partialDetails.push(`"${word}" encontrada`);
                } else {
                    // Try fuzzy matching with Levenshtein
                    const textWords = fullText.split(/\s+/);
                    let bestDist = Infinity;
                    let bestMatch = '';

                    for (const tw of textWords) {
                        if (Math.abs(tw.length - word.length) > 2) continue;
                        const dist = levenshtein(word, tw);
                        if (dist < bestDist && dist <= 2) {
                            bestDist = dist;
                            bestMatch = tw;
                        }
                    }

                    if (bestDist <= 2) {
                        fuzzyMatches++;
                        partialDetails.push(`"${word}" ≈ "${bestMatch}" (distancia: ${bestDist})`);
                    }

                    // Try stem matching
                    if (bestDist > 2) {
                        const textWordStems = textWords.map(tw => stem(tw));
                        if (textWordStems.includes(wordStem)) {
                            fuzzyMatches++;
                            partialDetails.push(`"${word}" (stem match)`);
                        }
                    }
                }
            }

            const totalMatches = wordMatches + fuzzyMatches;
            if (totalMatches > 0 && (!matchType || matchType !== 'exacta')) {
                const ratio = totalMatches / queryWords.length;
                if (ratio >= 0.5 || (queryWords.length === 1 && totalMatches > 0)) {
                    matchType = matchType === 'exacta' ? 'exacta' : 'parcial';
                    const titleMatch = queryWords.some(w => normalizedTitle.includes(w));
                    score = Math.max(score, 50 + (ratio * 30) + (wordMatches * 10) + (fuzzyMatches * 5) + (titleMatch ? 25 : 0));
                    matchDetails = matchDetails.concat(partialDetails);
                }
            }
        }

        // --- 3. SEMANTIC / RELATED MATCH ---
        if (!matchType) {
            let semanticScore = 0;
            let semanticDetails = [];

            // Check if any synonym appears in the text
            for (const syn of querySynonyms) {
                if (fullText.includes(syn)) {
                    semanticScore += 15;
                    semanticDetails.push(`Término relacionado: "${syn}"`);
                }
            }

            // Check stem similarity
            const textWords = fullText.split(/\s+/).slice(0, 500); // Limit for performance
            for (const qStem of queryStems) {
                for (const tw of textWords) {
                    if (stem(tw) === qStem && !queryWords.includes(tw)) {
                        semanticScore += 8;
                        semanticDetails.push(`Raíz común: "${tw}"`);
                        break;
                    }
                }
            }

            if (semanticScore > 0) {
                matchType = 'relacionada';
                const titleSynMatch = Array.from(querySynonyms).some(s => normalizedTitle.includes(s));
                score = semanticScore + (titleSynMatch ? 20 : 0);
                matchDetails = semanticDetails;
            }
        }

        if (matchType && score > 0) {
            const snippet = extractSnippet(page.content, cleanQuery);

            results.push({
                title: page.title,
                snippet,
                url: page.url,
                section: page.section,
                matchType,
                score: Math.round(score),
                details: matchDetails.slice(0, 3), // Limit detail lines
            });
        }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    // Limit results
    const maxResults = options.limit || 50;
    const limitedResults = results.slice(0, maxResults);

    const searchResult = {
        results: limitedResults,
        query: cleanQuery,
        totalResults: results.length,
        displayedResults: limitedResults.length,
        searchTime: Date.now() - startTime,
        indexSize: index.length,
    };

    // Cache the result
    searchCache.set(cacheKey, searchResult);

    return searchResult;
}

/**
 * Escape special regex characters
 */
function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { search };
