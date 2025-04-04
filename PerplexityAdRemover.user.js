// ==UserScript==
// @name         Perplexity UI Enhancer - Fixed
// @namespace    https://liufo.com/
// @version      2.1
// @description  Reliably removes ads and Discover button without breaking the chat
// @author       LiuFo Team (with improvements)
// @match        https://*.perplexity.ai/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // Core CSS injection for immediate effect - using targeted selectors
    function injectCoreStyles() {
        const style = document.createElement('style');
        style.textContent = `
            /* Targeted ad removal */
            a[aria-label="Discover"] {
                display: none !important;
            }

            /* Only target specific ad containers - avoid targeting all grids */
            .gap-sm.grid.grid-cols-6 > div:has(a[href*="windows"]),
            .gap-sm.grid.grid-cols-6 > div:has(svg[data-testid="WeatherIcon"]),
            .gap-sm.grid.grid-cols-6 > div:has(img[alt*="news"]),
            .gap-sm.grid.grid-cols-6 > div:has(span:contains("Sponsored")),
            .gap-sm.grid.grid-cols-6 > div:has(span:contains("广告")) {
                display: none !important;
            }
        `;
        document.head.appendChild(style);
    }

    // Element removal functions with safer selectors
    const cleanupOperations = {
        removeAds: () => {
            // Safely target only known ad elements
            const adSelectors = [
                'a[href*="windows"]',
                'svg[data-testid="WeatherIcon"]',
                'img[alt*="news"]',
                'div:has(> span:contains("Sponsored"))',
                'div:has(> span:contains("广告"))'
            ];

            // Only remove ads in the grid that appears at the top
            document.querySelectorAll('.gap-sm.grid.grid-cols-6').forEach(grid => {
                // Check each child individually instead of hiding all
                Array.from(grid.children).forEach(child => {
                    // Only hide if it contains ad indicators
                    for (const selector of adSelectors) {
                        try {
                            if (child.querySelector(selector)) {
                                child.style.display = 'none';
                                break;
                            }
                        } catch (e) {
                            // Ignore invalid selectors
                        }
                    }
                });
            });
        },

        removeDiscoverButton: () => {
            document.querySelectorAll('a[aria-label="Discover"]').forEach(a => {
                // Find and remove the button's container
                const container = a.closest('.relative.justify-center.w-full');
                if (container) {
                    container.style.display = 'none';
                } else {
                    a.style.display = 'none';
                }
            });
        }
    };

    // Less aggressive observer configuration
    const observerConfig = {
        childList: true,
        subtree: true,
        attributes: false  // Don't watch attributes to reduce processing
    };

    // Simplified DOM change handler with debounce
    let debounceTimeout = null;
    function handleDOMChanges() {
        if (debounceTimeout) clearTimeout(debounceTimeout);

        debounceTimeout = setTimeout(() => {
            cleanupOperations.removeAds();
            cleanupOperations.removeDiscoverButton();
        }, 300);  // Slower timing to avoid performance issues
    }

    // Detect route changes in SPA
    function detectRouteChanges() {
        let lastUrl = location.href;
        const observer = new MutationObserver(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                // Delay cleanup to avoid breaking the UI
                setTimeout(handleDOMChanges, 500);
            }
        });
        observer.observe(document, {subtree: true, childList: true});
    }

    // Initialization sequence
    (function init() {
        // Immediate style injection
        if (document.head) {
            injectCoreStyles();
        } else {
            new MutationObserver((_, observer) => {
                if (document.head) {
                    injectCoreStyles();
                    observer.disconnect();
                }
            }).observe(document.documentElement, { childList: true });
        }

        // Configure main observer with less aggressive settings
        const domObserver = new MutationObserver(handleDOMChanges);
        domObserver.observe(document, observerConfig);

        // Setup SPA route change detection
        detectRouteChanges();

        // Initial cleanup and setup interval (slower interval)
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                handleDOMChanges();
                setInterval(handleDOMChanges, 5000);  // Much slower interval
            });
        } else {
            handleDOMChanges();
            setInterval(handleDOMChanges, 5000);  // Much slower interval
        }
    })();
})();
