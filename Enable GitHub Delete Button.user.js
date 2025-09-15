// ==UserScript==
// @name         Enable GitHub Delete Button
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Ermöglicht das Löschen von GitHubRepos ohne Eingabe des Repo-Namen.
// @author       Sobol
// @match        https://github.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    
    function enableDeleteButton(button) {
        if (button.hasAttribute('disabled')) {
            button.removeAttribute('disabled');
            console.log('GitHub Delete Button aktiviert.');
        }
    }

    
    const observer = new MutationObserver((mutationsList) => {
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList' || mutation.type === 'attributes') {
                const button = document.getElementById('repo-delete-proceed-button');
                if (button) {
                    enableDeleteButton(button);
                }
            }
        }
    });

    
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['disabled']
    });

    
    const initialButton = document.getElementById('repo-delete-proceed-button');
    if (initialButton) {
        enableDeleteButton(initialButton);
    }

})();
