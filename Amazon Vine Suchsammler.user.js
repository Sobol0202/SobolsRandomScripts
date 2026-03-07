// ==UserScript==
// @name         Amazon Vine Suchsammler
// @version      1.0
// @description  Sucht mehrere Vine-Begriffe, zeigt alle Treffer in einem Modal und blendet bereits gespeicherte Artikel dauerhaft aus.
// @match        https://www.amazon.de/vine/vine-items*
// @run-at       document-idle
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    'use strict';

    // Suchbegriffe im Format: 'Begriff',
    const SEARCH_TERMS = [
        'Suche',
        'nach',
        'Suchbegriffen',
        'und',
        'zeige',
        'diese Artikel',
        'an.',
        // Suchbegriffe stehen hier
    ];

    const SEARCH_DELAY_MS = 200;
    const DB_NAME = 'vine_hidden_items_db';
    const DB_VERSION = 1;
    const STORE_NAME = 'hidden_items';

    const IDS = {
        openBtn: 'tm-vine-open-search-modal-btn',
        modal: 'tm-vine-search-modal',
        modalBackdrop: 'tm-vine-search-modal-backdrop',
        modalBody: 'tm-vine-search-modal-body',
        modalStatus: 'tm-vine-search-modal-status',
        modalClose: 'tm-vine-search-modal-close',
        modalRefresh: 'tm-vine-search-modal-refresh'
    };

    // CSS Styles
    GM_addStyle(`
        #${IDS.openBtn} {
            margin-right: 10px;
            cursor: pointer;
            border: 1px solid #d5d9d9;
            background: #ffd814;
            color: #0f1111;
            border-radius: 8px;
            padding: 8px 14px;
            font-size: 13px;
            line-height: 1.2;
            box-shadow: 0 2px 5px rgba(0,0,0,0.12);
        }

        #${IDS.openBtn}:hover {
            background: #f7ca00;
        }

        #${IDS.modalBackdrop} {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.65);
            z-index: 999999;
            display: none;
            align-items: center;
            justify-content: center;
            padding: 20px;
            box-sizing: border-box;
        }

        #${IDS.modal} {
            width: min(1400px, 96vw);
            height: min(90vh, 96vh);
            background: #fff;
            border-radius: 14px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            box-shadow: 0 20px 60px rgba(0,0,0,0.35);
        }

        .tm-vine-modal-header {
            display: flex;
            align-items: center;
            gap: 10px;
            justify-content: space-between;
            padding: 16px 20px;
            border-bottom: 1px solid #e7e7e7;
            background: #f8f8f8;
        }

        .tm-vine-modal-title-wrap {
            min-width: 0;
            flex: 1;
        }

        .tm-vine-modal-title {
            font-size: 20px;
            font-weight: 700;
            margin: 0 0 6px;
            color: #111;
        }

        #${IDS.modalStatus} {
            font-size: 13px;
            color: #555;
            word-break: break-word;
        }

        .tm-vine-modal-actions {
            display: flex;
            gap: 8px;
            align-items: center;
            flex-shrink: 0;
        }

        .tm-vine-modal-btn {
            cursor: pointer;
            border: 1px solid #d5d9d9;
            background: #fff;
            color: #111;
            border-radius: 8px;
            padding: 8px 12px;
            font-size: 13px;
        }

        .tm-vine-modal-btn:hover {
            background: #f3f3f3;
        }

        #${IDS.modalBody} {
            flex: 1;
            overflow: auto;
            padding: 18px;
            background: #fff;
        }

        .tm-vine-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
            gap: 16px;
            align-items: start;
        }

        .tm-vine-item-wrap {
            border: 1px solid #e3e6e6;
            border-radius: 12px;
            padding: 10px;
            background: #fff;
            box-sizing: border-box;
        }

        .tm-vine-item-actions {
            display: flex;
            justify-content: space-between;
            gap: 8px;
            margin-top: 10px;
        }

        .tm-vine-hide-btn,
        .tm-vine-open-product-btn {
            cursor: pointer;
            border: 1px solid #d5d9d9;
            border-radius: 8px;
            padding: 8px 10px;
            font-size: 12px;
            line-height: 1.2;
            text-align: center;
            text-decoration: none;
            box-sizing: border-box;
        }

        .tm-vine-hide-btn {
            background: #fff;
            color: #111;
            flex: 1;
        }

        .tm-vine-hide-btn:hover {
            background: #f3f3f3;
        }

        .tm-vine-open-product-btn {
            background: #ffd814;
            color: #111;
            flex: 1;
        }

        .tm-vine-open-product-btn:hover {
            background: #f7ca00;
        }

        .tm-vine-empty-state {
            padding: 30px;
            text-align: center;
            color: #444;
            font-size: 15px;
        }

        .tm-vine-loading {
            padding: 30px;
            text-align: center;
            color: #444;
            font-size: 15px;
        }
        .tm-vine-item-wrap {
    position: relative;
}

.tm-vine-search-badge {
    position: absolute;
    top: 6px;
    right: 6px;
    background: #232f3e;
    color: white;
    font-size: 11px;
    padding: 3px 6px;
    border-radius: 6px;
    z-index: 5;
    opacity: 0.9;
}
    `);

    // Hilfsfunktionen
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function absoluteUrl(url) {
        return new URL(url, location.origin).href;
    }

    function escapeHtml(value) {
        const div = document.createElement('div');
        div.textContent = value ?? '';
        return div.innerHTML;
    }

    async function waitForElement(selector, timeoutMs = 15000) {
        const start = Date.now();

        return new Promise((resolve, reject) => {
            const check = () => {
                const el = document.querySelector(selector);
                if (el) {
                    observer.disconnect();
                    resolve(el);
                    return;
                }

                if (Date.now() - start > timeoutMs) {
                    observer.disconnect();
                    reject(new Error(`Element nicht gefunden: ${selector}`));
                }
            };

            const observer = new MutationObserver(check);
            observer.observe(document.documentElement, { childList: true, subtree: true });
            check();
        });
    }

    function getItemIdFromTile(tile) {
        const detailsInput = tile.querySelector('input[data-asin]');
        const asin = detailsInput?.dataset?.asin?.trim();
        if (asin) return `asin:${asin}`;

        const recId = tile.getAttribute('data-recommendation-id')?.trim();
        if (recId) return `rec:${recId}`;

        const href = tile.querySelector('a.a-link-normal[href]')?.getAttribute('href')?.trim();
        if (href) return `href:${href}`;

        return null;
    }

    function getAsinFromTile(tile) {
        return tile.querySelector('input[data-asin]')?.dataset?.asin?.trim() || null;
    }

    function getTitleFromTile(tile) {
        const title =
            tile.querySelector('.a-truncate-full')?.textContent?.trim() ||
            tile.querySelector('.vvp-item-product-title-container')?.textContent?.trim() ||
            '';
        return title;
    }

    function getHrefFromTile(tile) {
        const href = tile.querySelector('a.a-link-normal[href]')?.getAttribute('href');
        return href ? absoluteUrl(href) : null;
    }

    function normalizeFetchedTile(tile) {
        const cloned = document.importNode(tile, true);

        cloned.querySelectorAll('a[href]').forEach(a => {
            const href = a.getAttribute('href');
            if (href) a.href = absoluteUrl(href);
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
        });

        cloned.querySelectorAll('img[src]').forEach(img => {
            const src = img.getAttribute('src');
            if (src) img.src = absoluteUrl(src);
        });

        return cloned;
    }

    // IndexDB
    function openDb() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = function (event) {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    store.createIndex('hiddenAt', 'hiddenAt', { unique: false });
                }
            };

            request.onsuccess = function () {
                resolve(request.result);
            };

            request.onerror = function () {
                reject(request.error || new Error('IndexedDB konnte nicht geöffnet werden.'));
            };
        });
    }

    async function getAllHiddenIds() {
        const db = await openDb();

        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.getAllKeys();

            request.onsuccess = () => resolve(new Set(request.result));
            request.onerror = () => reject(request.error || new Error('Konnte Hidden-IDs nicht laden.'));
        });
    }

    async function saveHiddenItem(item) {
        const db = await openDb();

        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);

            const data = {
                id: item.id,
                asin: item.asin || null,
                title: item.title || '',
                href: item.href || null,
                hiddenAt: Date.now()
            };

            const request = store.put(data);

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error || new Error('Konnte Artikel nicht speichern.'));
        });
    }

    // Modal
    function ensureModal() {
        let backdrop = document.getElementById(IDS.modalBackdrop);
        if (backdrop) return backdrop;

        backdrop = document.createElement('div');
        backdrop.id = IDS.modalBackdrop;
        backdrop.innerHTML = `
            <div id="${IDS.modal}" role="dialog" aria-modal="true" aria-label="Vine Suchergebnisse">
                <div class="tm-vine-modal-header">
                    <div class="tm-vine-modal-title-wrap">
                        <div class="tm-vine-modal-title">Vine Suchergebnisse</div>
                        <div id="${IDS.modalStatus}">Bereit</div>
                    </div>
                    <div class="tm-vine-modal-actions">
                        <button type="button" class="tm-vine-modal-btn" id="${IDS.modalRefresh}">Neu laden</button>
                        <button type="button" class="tm-vine-modal-btn" id="${IDS.modalClose}">Schließen</button>
                    </div>
                </div>
                <div id="${IDS.modalBody}"></div>
            </div>
        `;

        backdrop.addEventListener('click', (event) => {
            if (event.target === backdrop) {
                hideModal();
            }
        });

        document.body.appendChild(backdrop);

        document.getElementById(IDS.modalClose)?.addEventListener('click', hideModal);
        document.getElementById(IDS.modalRefresh)?.addEventListener('click', async () => {
            await loadAndShowResults();
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && backdrop.style.display === 'flex') {
                hideModal();
            }
        });

        return backdrop;
    }

    function showModal() {
        const backdrop = ensureModal();
        backdrop.style.display = 'flex';
    }

    function hideModal() {
        const backdrop = document.getElementById(IDS.modalBackdrop);
        if (backdrop) backdrop.style.display = 'none';
    }

    function setStatus(text) {
        const el = document.getElementById(IDS.modalStatus);
        if (el) el.textContent = text;
    }

    function setModalLoading(text = 'Lade...') {
        const body = document.getElementById(IDS.modalBody);
        if (!body) return;
        body.innerHTML = `<div class="tm-vine-loading">${escapeHtml(text)}</div>`;
    }

    function setModalEmpty(text = 'Keine Treffer gefunden.') {
        const body = document.getElementById(IDS.modalBody);
        if (!body) return;
        body.innerHTML = `<div class="tm-vine-empty-state">${escapeHtml(text)}</div>`;
    }

    function renderResults(items) {
        const body = document.getElementById(IDS.modalBody);
        if (!body) return;

        if (!items.length) {
            setModalEmpty('Keine neuen Treffer gefunden. Bereits ausgeblendete Artikel werden nicht mehr angezeigt.');
            return;
        }

        body.innerHTML = '';
        const grid = document.createElement('div');
        grid.className = 'tm-vine-grid';

        for (const item of items) {
            const wrapper = document.createElement('div');
            wrapper.className = 'tm-vine-item-wrap';
            wrapper.dataset.itemId = item.id;

            // Suchbegriff Badge
            const badge = document.createElement('div');
            badge.className = 'tm-vine-search-badge';
            badge.textContent = item.searchTerm;
            wrapper.appendChild(badge);

            const tileNode = normalizeFetchedTile(item.tile);

            const actions = document.createElement('div');
            actions.className = 'tm-vine-item-actions';

            const hideBtn = document.createElement('button');
            hideBtn.type = 'button';
            hideBtn.className = 'tm-vine-hide-btn';
            hideBtn.textContent = 'Ausblenden';
            hideBtn.dataset.itemId = item.id;

            actions.appendChild(hideBtn);

            const href = item.href || getHrefFromTile(item.tile);
            if (href) {
                const openBtn = document.createElement('a');
                openBtn.className = 'tm-vine-open-product-btn';
                openBtn.textContent = 'Produkt öffnen';
                openBtn.href = href;
                openBtn.target = '_blank';
                openBtn.rel = 'noopener noreferrer';
                actions.appendChild(openBtn);
            }

            wrapper.appendChild(tileNode);
            wrapper.appendChild(actions);
            grid.appendChild(wrapper);
        }

        grid.addEventListener('click', async (event) => {
            const btn = event.target.closest('.tm-vine-hide-btn');
            if (!btn) return;

            const itemId = btn.dataset.itemId;
            if (!itemId) return;

            const wrap = btn.closest('.tm-vine-item-wrap');
            if (!wrap) return;

            const item = items.find(x => x.id === itemId);
            if (!item) return;

            btn.disabled = true;
            btn.textContent = 'Speichere...';

            try {
                await saveHiddenItem({
                    id: item.id,
                    asin: item.asin,
                    title: item.title,
                    href: item.href
                });

                wrap.remove();

                const remaining = body.querySelectorAll('.tm-vine-item-wrap').length;
                setStatus(`${remaining} sichtbare Treffer`);

                if (remaining === 0) {
                    setModalEmpty('Alle angezeigten Artikel wurden ausgeblendet.');
                }
            } catch (error) {
                console.error(error);
                btn.disabled = false;
                btn.textContent = 'Ausblenden';
                alert('Der Artikel konnte nicht gespeichert werden.');
            }
        },);

        body.appendChild(grid);
    }

    // Suchen und Parsen
    async function fetchSearchPage(searchTerm) {
        const url = `https://www.amazon.de/vine/vine-items?search=${encodeURIComponent(searchTerm)}`;

        const response = await fetch(url, {
            method: 'GET',
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error(`Fehler beim Abruf für "${searchTerm}": HTTP ${response.status}`);
        }

        return response.text();
    }

    function parseTilesFromHtml(html, searchTerm) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const tiles = Array.from(doc.querySelectorAll('.vvp-item-tile'));

        return tiles.map(tile => ({
            searchTerm,
            tile,
            id: getItemIdFromTile(tile),
            asin: getAsinFromTile(tile),
            title: getTitleFromTile(tile),
            href: getHrefFromTile(tile)
        })).filter(item => item.id);
    }

    async function collectResults() {
        const hiddenIds = await getAllHiddenIds();
        const results = [];
        const seenIds = new Set();

        for (let i = 0; i < SEARCH_TERMS.length; i++) {
            const term = SEARCH_TERMS[i];
            setStatus(`Lade ${i + 1}/${SEARCH_TERMS.length}: "${term}"`);

            try {
                const html = await fetchSearchPage(term);
                const parsedItems = parseTilesFromHtml(html, term);

                for (const item of parsedItems) {
                    if (hiddenIds.has(item.id)) continue;
                    if (seenIds.has(item.id)) continue;

                    seenIds.add(item.id);
                    results.push(item);
                }
            } catch (error) {
                console.error(`Suchfehler für "${term}"`, error);
            }

            if (i < SEARCH_TERMS.length - 1) {
                await sleep(SEARCH_DELAY_MS);
            }
        }

        return results;
    }

    async function loadAndShowResults() {
        showModal();
        setModalLoading('Suchergebnisse werden geladen...');
        setStatus(`Starte Suche über ${SEARCH_TERMS.length} Begriff(e)...`);

        try {
            const results = await collectResults();

            results.sort((a, b) => a.title.localeCompare(b.title, 'de', { sensitivity: 'base' }));

            renderResults(results);
            setStatus(`${results.length} neue Treffer aus ${SEARCH_TERMS.length} Suchbegriff(en)`);
        } catch (error) {
            console.error(error);
            setModalEmpty('Beim Laden ist ein Fehler aufgetreten.');
            setStatus('Fehler beim Laden');
        }
    }

    // Button einfügen
    function insertButton() {
        if (document.getElementById(IDS.openBtn)) return;

        const betaTag = document.getElementById('vvp-beta-tag');
        if (!betaTag || !betaTag.parentNode) return;

        const button = document.createElement('button');
        button.id = IDS.openBtn;
        button.type = 'button';
        button.textContent = 'Gespeicherte Suche öffnen';

        button.addEventListener('click', async () => {
            await loadAndShowResults();
        });

        betaTag.parentNode.insertBefore(button, betaTag);
    }

    async function init() {
        try {
            await waitForElement('#vvp-beta-tag');
            ensureModal();
            insertButton();

            const observer = new MutationObserver(() => {
                insertButton();
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        } catch (error) {
            console.error('Tampermonkey-Script konnte nicht initialisiert werden:', error);
        }
    }

    init();
})();
