// ==UserScript==
// @name         YouTube Ad Overlay Remover
// @namespace    www.youtube.com
// @version      1.0
// @description  Remove paid content overlay on YouTube video previews
// @author       Sobol
// @match        https://www.youtube.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Function to hide the paid content overlay
    function hidePaidContentOverlay() {
        const overlays = document.querySelectorAll('.YtmPaidContentOverlayHost');
        overlays.forEach(overlay => {
            overlay.style.display = 'none';
        });
    }

    // Initial check
    hidePaidContentOverlay();

    // Set up a MutationObserver to detect changes in the DOM
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.addedNodes.length) {
                hidePaidContentOverlay();
            }
        });
    });

    // Observe changes in the entire body
    observer.observe(document.body, { childList: true, subtree: true });
})();
