/**
 * Circulante Search Engine — Frontend Application Logic
 */

(function () {
    'use strict';

    // DOM References
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    const searchBox = document.getElementById('searchBox');
    const suggestions = document.getElementById('suggestions');
    const statusBar = document.getElementById('statusContent');
    const emptyState = document.getElementById('emptyState');
    const loadingState = document.getElementById('loadingState');
    const loadingText = document.getElementById('loadingText');
    const errorState = document.getElementById('errorState');
    const errorText = document.getElementById('errorText');
    const retryBtn = document.getElementById('retryBtn');
    const noResultsState = document.getElementById('noResultsState');
    const noResultsQuery = document.getElementById('noResultsQuery');
    const resultsList = document.getElementById('resultsList');

    // modal System
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'contentModal';
    modal.innerHTML = `
        <div class="modal__overlay"></div>
        <div class="modal__container">
            <header class="modal__header">
                <div class="modal__badges">
                    <span class="badge badge--section" id="modalSection"></span>
                </div>
                <h2 class="modal__title" id="modalTitle"></h2>
                <button class="modal__close" id="modalClose" aria-label="Cerrar">&times;</button>
            </header>
            <div class="modal__body" id="modalBody"></div>
            <footer class="modal__footer">
                <a href="" id="modalExternalLink" target="_blank" rel="noopener noreferrer" class="result-card__link">
                    Ver página original
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/>
                    </svg>
                </a>
            </footer>
        </div>
    `;
    document.body.appendChild(modal);

    const modalTitle = document.getElementById('modalTitle');
    const modalSection = document.getElementById('modalSection');
    const modalBody = document.getElementById('modalBody');
    const modalClose = document.getElementById('modalClose');
    const modalOverlay = modal.querySelector('.modal__overlay');
    const modalExternalLink = document.getElementById('modalExternalLink');

    let lastQuery = '';
    let isSearching = false;

    // ---- State Management ----
    function showState(state) {
        emptyState.style.display = 'none';
        loadingState.style.display = 'none';
        errorState.style.display = 'none';
        noResultsState.style.display = 'none';
        resultsList.style.display = 'none';

        switch (state) {
            case 'empty':
                emptyState.style.display = 'block';
                break;
            case 'loading':
                loadingState.style.display = 'block';
                break;
            case 'error':
                errorState.style.display = 'block';
                break;
            case 'noResults':
                noResultsState.style.display = 'block';
                break;
            case 'results':
                resultsList.style.display = 'block';
                break;
        }
    }

    // ---- Search ----
    async function performSearch(query) {
        if (!query || query.trim().length < 2 || isSearching) return;

        const trimmed = query.trim();
        lastQuery = trimmed;
        isSearching = true;

        searchBtn.disabled = true;
        showState('loading');
        loadingText.textContent = 'Buscando coincidencias en circulante.es.tl...';
        statusBar.innerHTML = '';

        try {
            const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`);

            if (response.status === 429) {
                const data = await response.json();
                throw new Error(data.error || 'Demasiadas solicitudes. Esperá un momento.');
            }

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || `Error del servidor (${response.status})`);
            }

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Respuesta inválida del servidor.');
            }

            if (data.results.length === 0) {
                noResultsQuery.textContent = trimmed;
                showState('noResults');
                statusBar.innerHTML = `Sin resultados en <span class="highlight">${data.indexSize}</span> páginas (${data.searchTime}ms)`;
            } else {
                renderResults(data);
                showState('results');
                statusBar.innerHTML =
                    `<span class="highlight">${data.totalResults}</span> resultado${data.totalResults !== 1 ? 's' : ''} en ` +
                    `<span class="highlight">${data.indexSize}</span> páginas · ${data.searchTime}ms` +
                    (data.fromCache ? ' · <span class="highlight">caché</span>' : '');
            }
        } catch (err) {
            console.error('Search error:', err);
            errorText.textContent = err.message || 'No se pudo completar la búsqueda. Verificá tu conexión.';
            showState('error');
            statusBar.innerHTML = '';
        } finally {
            isSearching = false;
            searchBtn.disabled = false;
            searchInput.focus();
        }
    }

    // ---- Render Results ----
    function renderResults(data) {
        const { results, query } = data;

        let html = `
      <div class="results-header">
        <h2 class="results-header__title">Resultados para "${escapeHtml(query)}"</h2>
        <span class="results-header__meta">${data.displayedResults} de ${data.totalResults} mostrados</span>
      </div>
    `;

        results.forEach((result, index) => {
            const matchClass = getMatchClass(result.matchType);
            const matchLabel = getMatchLabel(result.matchType);
            const formattedSnippet = formatMedicalText(escapeHtml(result.snippet));
            const highlightedSnippet = highlightTerms(formattedSnippet, query);

            const displayUrl = safeDecode(result.url).replace('https://circulante.es.tl/', '');

            html += `
        <article class="result-card" style="animation-delay: ${Math.min(index * 0.05, 0.5)}s">
          <div class="result-card__top">
            <h3 class="result-card__title">${escapeHtml(result.title)}</h3>
            <div class="result-card__badges">
              <span class="badge ${matchClass}">${matchLabel}</span>
              <span class="badge badge--section">${escapeHtml(result.section)}</span>
            </div>
          </div>
          <p class="result-card__snippet">${highlightedSnippet}</p>
          <div class="result-card__footer">
            <a href="${escapeHtml(result.url)}" class="result-card__url" target="_blank" rel="noopener noreferrer" title="${escapeHtml(result.url)}">
              ${escapeHtml(displayUrl)}
            </a>
            <div style="display:flex;align-items:center;gap:14px;">
              <button class="btn-expand" data-url="${escapeHtml(result.url)}">Leer más</button>
              <a href="${escapeHtml(result.url)}" class="result-card__link" target="_blank" rel="noopener noreferrer">
                Fuente
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </a>
            </div>
          </div>
        </article>
      `;
        });

        resultsList.innerHTML = html;
    }

    // ---- Highlight matched terms in snippet ----
    function highlightTerms(text, query) {
        if (!query) return text;

        const words = query.trim().split(/\s+/).filter(w => w.length > 1);
        let result = text;

        // Try to highlight the full query first
        const fullRegex = new RegExp(`(${escapeRegex(query)})`, 'gi');
        if (fullRegex.test(result)) {
            return result.replace(fullRegex, '<mark>$1</mark>');
        }

        // Then highlight individual words
        for (const word of words) {
            const wordRegex = new RegExp(`(${escapeRegex(word)})`, 'gi');
            result = result.replace(wordRegex, '<mark>$1</mark>');
        }

        return result;
    }

    // ---- Helpers ----
    function getMatchClass(matchType) {
        switch (matchType) {
            case 'exacta': return 'badge--exact';
            case 'parcial': return 'badge--partial';
            case 'relacionada': return 'badge--related';
            default: return 'badge--related';
        }
    }

    function getMatchLabel(matchType) {
        switch (matchType) {
            case 'exacta': return '● Exacta';
            case 'parcial': return '◐ Parcial';
            case 'relacionada': return '○ Relacionada';
            default: return matchType;
        }
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Formatea texto médico para mejor legibilidad.
     * Bildea etiquetas principales y organiza párrafos/listas.
     */
    function formatMedicalText(text, isFullContent = false) {
        if (!text) return '';

        // 1. Clean up repetitive headers or common site text
        let formatted = text
            .replace(/Copyright © 2026 Gonzalomazza.*/gi, '')
            .replace(/Este sitio web fue creado de forma gratuita.*/gi, '')
            .replace(/¿Quieres también tu sitio web propio?.*/gi, '')
            .replace(/Registrarse gratis.*/gi, '')
            .trim();

        // 2. Bold common labels (Instrumental:, Técnica:, etc)
        const labels = [
            'Instrumental', 'Materiales', 'Anestesia', 'Posición', 'Preparación',
            'Técnica quirúrgica', 'Procedimiento', 'Incisiones', 'Sutura', 'Equipamiento',
            'Consideraciones', 'Cierre', 'Complicaciones', 'Abordaje', 'Puntos clave'
        ];

        labels.forEach(label => {
            const regex = new RegExp(`(^|\\n|\\s)(${label}):`, 'gi');
            formatted = formatted.replace(regex, '$1<strong>$2:</strong>');
        });

        // 3. Inject breaks after periods if followed by a Capital (Sentences)
        // Ignoring common abbreviations like Dr. or Sr.
        formatted = formatted.replace(/(\.|\?|!)\s+([A-ZÁÉÍÓÚ])/g, '$1<br><br>$2');

        // 4. Format lists (lines starting with • or - or numbers)
        formatted = formatted.replace(/(^|\n)([•\-\*])\s*/g, '$1<br>• ');
        formatted = formatted.replace(/(^|\n)(\d+[\-\.)])\s+/g, '$1<br><strong>$2</strong> ');

        // 5. Detect blocks of capitalized words (Potential lists like "Compresas Gasas Riñón")
        // If we see 3+ capitalized words in a row, it's likely a list
        formatted = formatted.replace(/([A-ZÁÉÍÓÚ][a-zñáéíóú]+\s+){3,}/g, match => {
            return '<br>• ' + match.trim().split(/\s+/).join('<br>• ') + ' ';
        });

        if (isFullContent) {
            // Convert multiple breaks to paragraphs for modal
            formatted = formatted
                .split(/(?:<br\s*\/?>\s*){2,}/)
                .map(p => p.trim())
                .filter(p => p.length > 0)
                .map(p => `<p>${p}</p>`)
                .join('');
        }

        return formatted;
    }

    function safeDecode(str) {
        try {
            return decodeURIComponent(str);
        } catch (e) {
            // Fallback: manually replace common encoded Spanish characters if decodeURIComponent fails
            return str
                .replace(/%E1/g, 'á').replace(/%E9/g, 'é')
                .replace(/%ED/g, 'í').replace(/%F3/g, 'ó')
                .replace(/%FA/g, 'ú').replace(/%F1/g, 'ñ')
                .replace(/%C1/g, 'Á').replace(/%C9/g, 'É')
                .replace(/%CD/g, 'Í').replace(/%D3/g, 'Ó')
                .replace(/%DA/g, 'Ú').replace(/%D1/g, 'Ñ');
        }
    }

    // ---- Event Listeners ----

    // Search on button click
    searchBtn.addEventListener('click', () => {
        performSearch(searchInput.value);
    });

    // Search on Enter key
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            performSearch(searchInput.value);
        }
    });

    // Suggestion chip clicks
    suggestions.addEventListener('click', (e) => {
        const chip = e.target.closest('.chip');
        if (chip) {
            const query = chip.dataset.query;
            searchInput.value = query;
            performSearch(query);
        }
    });

    // Expand button clicks (Delegation)
    resultsList.addEventListener('click', async (e) => {
        const btn = e.target.closest('.btn-expand');
        if (btn) {
            const url = btn.dataset.url;
            openModal(url);
        }
    });

    async function openModal(url) {
        modalTitle.textContent = 'Cargando...';
        modalSection.textContent = '';
        modalBody.innerHTML = '<div class="loader-small"></div>';
        modal.classList.add('modal--open');
        document.body.style.overflow = 'hidden';

        try {
            const res = await fetch(`/api/page?url=${encodeURIComponent(url)}`);
            const data = await res.json();
            if (data.success) {
                modalTitle.textContent = data.page.title;
                modalSection.textContent = data.page.section;
                modalExternalLink.href = data.page.url;

                // Format content (simple hack for surgery text)
                const formatted = escapeHtml(data.page.content)
                    .replace(/\n\s*\n/g, '</p><p>')
                    .replace(/\n/g, '<br>');

                modalBody.innerHTML = `<p>${formatted}</p>`;
            } else {
                throw new Error(data.error);
            }
        } catch (e) {
            modalTitle.textContent = 'Error';
            modalBody.innerHTML = `<p class="error-text">No se pudo cargar la información: ${e.message}</p>`;
        }
    }

    function closeModal() {
        modal.classList.remove('modal--open');
        document.body.style.overflow = '';
    }

    modalClose.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', closeModal);

    // ESC key to close modal
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });

    // Retry button
    retryBtn.addEventListener('click', () => {
        if (lastQuery) {
            performSearch(lastQuery);
        }
    });

    // Focus input on load
    searchInput.focus();

    // Initial status check
    (async function checkStatus() {
        try {
            const res = await fetch('/api/status');
            const data = await res.json();
            if (data.success && data.crawler) {
                const { pagesIndexed, crawlInProgress } = data.crawler;
                if (crawlInProgress) {
                    statusBar.innerHTML = 'Indexando el sitio... Esto puede tomar unos segundos.';
                } else if (pagesIndexed > 0) {
                    statusBar.innerHTML = `<span class="highlight">${pagesIndexed}</span> páginas indexadas y listas para búsqueda`;
                }
            }
        } catch (e) {
            // silent
        }
    })();

    // Poll status while crawl might be in progress
    let statusInterval = setInterval(async () => {
        try {
            const res = await fetch('/api/status');
            const data = await res.json();
            if (data.success && data.crawler) {
                const { pagesIndexed, crawlInProgress } = data.crawler;
                if (!crawlInProgress && pagesIndexed > 0) {
                    statusBar.innerHTML = `<span class="highlight">${pagesIndexed}</span> páginas indexadas y listas para búsqueda`;
                    clearInterval(statusInterval);
                } else if (crawlInProgress) {
                    statusBar.innerHTML = 'Indexando el sitio... Esto puede tomar unos segundos.';
                }
            }
        } catch (e) {
            clearInterval(statusInterval);
        }
    }, 3000);

    // Stop polling after 2 minutes
    setTimeout(() => clearInterval(statusInterval), 120000);

})();
