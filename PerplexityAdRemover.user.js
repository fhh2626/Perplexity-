// ==UserScript==
// @name         Perplexity UI Enhancer - Complete
// @namespace    https://liufo.com/
// @version      3.0
// @description  Removes all ads and Discover button including the ones below the search box
// @author       LiuFo Team (with comprehensive improvements)
// @match        https://*.perplexity.ai/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // More comprehensive CSS injection that specifically targets the homepage grid items
    function injectCoreStyles() {
        const style = document.createElement('style');
        style.textContent = `
            /* Hide Discover button */
            a[aria-label="Discover"],
            div:has(> a[aria-label="Discover"]) {
                display: none !important;
            }

            /* Target the entire promotional grid below search box */
            .mt-lg div.gap-sm.grid.grid-cols-6 {
                display: none !important;
            }

            /* Hide Windows app promotion */
            div:has(> a[href*="windows"]),
            div:has(> a[href*="Windows"]),
            div[class*="Introducing"] {
                display: none !important;
            }

            /* Hide specific ads by content indicators */
            div:has(> div:has(> svg[data-testid="WeatherIcon"])),
            div:has(> div:has(> img[src*="news"])),
            div:has(> div:has(> span:contains("Sponsored"))),
            div:has(> div:has(> span:contains("广告"))) {
                display: none !important;
            }

            /* Target news items by their structure */
            div.col-span-2.row-span-1.rounded-md,
            div.col-span-2.row-span-2.rounded-md {
                display: none !important;
            }
        `;
        document.head.appendChild(style);
    }

    // Enhanced element removal function
    function cleanupElements() {
        // Remove the entire grid container below search box
        document.querySelectorAll('.mt-lg div.gap-sm.grid.grid-cols-6').forEach(grid => {
            grid.style.display = 'none';
        });

        // Remove Discover button and its container
        document.querySelectorAll('a[aria-label="Discover"]').forEach(element => {
            const parent = element.closest('.relative.justify-center.w-full');
            if (parent) parent.style.display = 'none';
            else element.style.display = 'none';
        });

        // Remove Windows app promotion
        document.querySelectorAll('div[class*="Introducing"]').forEach(element => {
            element.style.display = 'none';
        });
    }

    // More efficient observer with better targeting
    const observerConfig = {
        childList: true,
        subtree: true
    };

    // Debounced cleanup function
    let debounceTimeout = null;
    function handleDOMChanges() {
        if (debounceTimeout) clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => {
            cleanupElements();
        }, 200);
    }

    // Initialize
    function init() {
        // Inject styles immediately
        if (document.head) {
            injectCoreStyles();
        } else {
            document.addEventListener('DOMContentLoaded', injectCoreStyles);
        }

        // Setup DOM observer
        const observer = new MutationObserver(handleDOMChanges);
        if (document.body) {
            observer.observe(document.body, observerConfig);
            cleanupElements();
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                observer.observe(document.body, observerConfig);
                cleanupElements();
            });
        }

        // Periodic cleanup for dynamic content
        setInterval(cleanupElements, 2000);

        // Handle SPA navigation
        let lastUrl = location.href;
        const urlObserver = new MutationObserver(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                setTimeout(cleanupElements, 500);
            }
        });
        urlObserver.observe(document, observerConfig);
    }

    // Execute initialization
    init();
})();
