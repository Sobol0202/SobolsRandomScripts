// ==UserScript==
// @name         Amazon Vine Exporter
// @version      1.0
// @description  Exportiert Vine-Produkte
// @author       Sobol
// @match        https://www.amazon.de/vine/vine-items?queue=encore*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let buttonInserted = false;
    let exportButton;

    function insertButton() {
        const headerLinksContainer = document.querySelector('ul.vvp-header-links-container');
        if (headerLinksContainer && !buttonInserted) {
            const newListItem = document.createElement('li');
            newListItem.className = 'vvp-header-link';

            exportButton = document.createElement('button');
            exportButton.textContent = '🔵 Produkte exportieren';
            Object.assign(exportButton.style, {
                margin: '5px',
                padding: '10px 15px',
                backgroundColor: '#007bff',
                color: 'white',
                fontSize: '14px',
                border: '2px solid black',
                borderRadius: '6px',
                cursor: 'pointer'
            });
            exportButton.addEventListener('click', startExport);

            newListItem.appendChild(exportButton);
            headerLinksContainer.appendChild(newListItem);

            buttonInserted = true;
        }
    }

    async function startExport() {
        exportButton.disabled = true;
        exportButton.textContent = '⏳ Initialisiere...';

        const maxPage = getMaxPageNumber();
        if (!maxPage) {
            alert('❌ Seitenanzahl nicht gefunden!');
            exportButton.textContent = '❌ Fehler';
            return;
        }

        let pageLimit = prompt(`Es wurden ${maxPage} Seiten erkannt. Wie viele Seiten möchtest du abrufen?`, Math.min(10, maxPage));
        pageLimit = parseInt(pageLimit);
        if (isNaN(pageLimit) || pageLimit < 1) {
            alert('❌ Ungültige Seitenanzahl.');
            exportButton.textContent = '❌ Abbruch';
            return;
        }

        const products = [];

        for (let page = 1; page <= pageLimit; page++) {
            exportButton.textContent = `🔄 Seite ${page} von ${pageLimit}`;
            try {
                const html = await fetchPage(page);
                const doc = new DOMParser().parseFromString(html, 'text/html');
                const itemsGrid = doc.querySelector('#vvp-items-grid');
                if (!itemsGrid) {
                    console.warn(`⚠️ Kein Produktgrid auf Seite ${page} gefunden`);
                    continue;
                }

                const tiles = itemsGrid.querySelectorAll('div.vvp-item-tile');
                console.log(`📦 Seite ${page}: ${tiles.length} Produkte gefunden`);

                tiles.forEach(tile => {
                    const titleEl = tile.querySelector('span.a-truncate-full.a-offscreen');
                    let title = titleEl?.textContent?.trim();

                    const linkEl = tile.querySelector('a#vvp-vine-items-product-detail-page-link');
                    const relativeLink = linkEl?.getAttribute('href');
                    const fullLink = relativeLink ? `https://www.amazon.de${relativeLink}` : 'Kein Link gefunden';

                    if (!title) {
                        title = linkEl?.textContent?.trim() || 'Unbekanntes Produkt';
                    }

                    //console.log(`➡️ Produkt: ${title} | Link: ${fullLink}`);
                    products.push([title, page, fullLink]);
                });

                await sleep(1000);
            } catch (e) {
                console.error(`❌ Fehler beim Abrufen von Seite ${page}:`, e);
            }
        }

        exportButton.textContent = '📦 CSV wird erstellt...';
        downloadCSV(products);
        exportButton.textContent = '✅ Export abgeschlossen';
    }

    function getMaxPageNumber() {
        const pagination = document.querySelector('ul.a-pagination');
        if (!pagination) return null;

        const pageLinks = pagination.querySelectorAll('li.a-normal a');
        let max = 1;

        pageLinks.forEach(link => {
            const num = parseInt(link.textContent.trim());
            if (!isNaN(num) && num > max) max = num;
        });

        const lastPage = pagination.querySelector('li:last-child a');
        if (lastPage) {
            const match = lastPage.href.match(/page=(\d+)/);
            if (match) {
                const last = parseInt(match[1]);
                if (last > max) max = last;
            }
        }

        return max;
    }

    async function fetchPage(page) {
        const url = new URL(window.location.href);
        url.searchParams.set('page', page);
        const res = await fetch(url.toString(), { credentials: 'same-origin' });
        return await res.text();
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function downloadCSV(data) {
        const bom = '\uFEFF';
        const csvContent = data.map(row =>
            row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(";")
        ).join("\n");
        const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", "produkte.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }


    const interval = setInterval(() => {
        if (!buttonInserted) insertButton();
        else clearInterval(interval);
    }, 500);
})();
