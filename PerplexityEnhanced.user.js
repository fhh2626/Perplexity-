// ==UserScript==
// @name Perplexity Enhanced - Direct Paste & Web Search Control
// @namespace http://tampermonkey.net/
// @version 1.1
// @description Paste long texts and control default Web search settings on Perplexity (English & Chinese support)
// @author You
// @match https://www.perplexity.ai/*
// @match https://perplexity.ai/*
// @icon https://www.perplexity.ai/favicon.ico
// @grant GM_getValue
// @grant GM_setValue
// @run-at document-idle
// ==/UserScript==

(function() {
'use strict';

// Debug mode - Set to true to see detailed logs in the console
const DEBUG = true;

// Maximum number of characters per chunk (avoids exceeding limits)
const CHUNK_SIZE = 2000;

// Delay between processing chunks (milliseconds)
const DELAY_BETWEEN_CHUNKS = 30;

// Logging function with timestamp
function log(...args) {
    if (DEBUG) {
        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        console.log(`[Perplexity Enhanced ${timeStr}]`, ...args);
    }
}

// Detect if the interface is in Chinese
function isChineseInterface() {
    const bodyText = document.body.textContent || '';
    return bodyText.includes('发现') || bodyText.includes('空间') || bodyText.includes('图书馆');
}

// Get localized text based on current interface language
function getLocalizedText(enText, zhText) {
    return isChineseInterface() ? zhText : enText;
}

// ============= Direct Paste Feature =============

// Retrieve the Direct Paste setting; default to true if not set
function isDirectPasteEnabled() {
    return GM_getValue('directPasteEnabled', true);
}

// Set the Direct Paste toggle state
function setDirectPasteEnabled(enabled) {
    GM_setValue('directPasteEnabled', enabled);

    const directPasteText = getLocalizedText('Direct Paste', '直接粘贴');
    updateButtonState('paste-toggle', enabled, directPasteText);

    const enabledMsg = getLocalizedText('Direct Paste mode enabled', '直接粘贴模式已启用');
    const disabledMsg = getLocalizedText('Direct Paste mode disabled', '直接粘贴模式已禁用');

    showToast(enabled ? enabledMsg : disabledMsg);
    log('Direct Paste mode switched to:', enabled);
}

// Insert text in chunks
async function insertTextInChunks(textarea, text, startPos, endPos) {
    try {
        const chunks = [];
        for (let i = 0; i < text.length; i += CHUNK_SIZE) {
            chunks.push(text.substring(i, i + CHUNK_SIZE));
        }

        if (chunks.length > 1) {
            const processingMsg = getLocalizedText(
                `Processing long text: ${chunks.length} chunks...`,
                `处理长文本: ${chunks.length} 个片段...`
            );
            showToast(processingMsg);
            log(`Split text into ${chunks.length} chunks`);
        }

        const originalText = textarea.value;
        let newText = originalText.substring(0, startPos);
        let currentPos = startPos;

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            newText += chunk;
            textarea.value = newText + originalText.substring(endPos);

            currentPos += chunk.length;
            textarea.selectionStart = textarea.selectionEnd = currentPos;

            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.dispatchEvent(new Event('change', { bubbles: true }));

            if (i < chunks.length - 1) {
                await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_CHUNKS));
            }
        }

        if (chunks.length > 1) {
            const doneMsg = getLocalizedText(
                `Done! Inserted ${text.length} characters.`,
                `完成！已插入 ${text.length} 个字符。`
            );
            showToast(doneMsg);
            log(`Successfully inserted ${text.length} characters`);
        }
    } catch (error) {
        log('Error inserting text:', error);
        const errorMsg = getLocalizedText(
            'Error inserting text. Try reducing the text length or refreshing the page.',
            '插入文本时出错。请尝试减少文本长度或刷新页面。'
        );
        showToast(errorMsg);
    }
}

// Handle paste events
function handlePasteEvent() {
    document.addEventListener('paste', function(event) {
        if (!isDirectPasteEnabled()) {
            log('Direct Paste mode is disabled; skipping paste event');
            return;
        }

        const activeElement = document.activeElement;
        if (!activeElement || activeElement.tagName !== 'TEXTAREA') {
            log('Focus is not on a text area; skipping paste event');
            return;
        }

        const clipboardData = event.clipboardData || window.clipboardData;
        const pastedText = clipboardData.getData('text/plain');

        if (pastedText && pastedText.length > CHUNK_SIZE) {
            log(`Detected long pasted text (${pastedText.length} characters). Starting chunked processing.`);
            event.stopPropagation();
            event.preventDefault();

            const start = activeElement.selectionStart;
            const end = activeElement.selectionEnd;
            insertTextInChunks(activeElement, pastedText, start, end);
        } else {
            log('Text length is within the limit; using default paste behavior');
        }
    }, true);

    log('Paste event handler set');
}

// ============= Web Search Control Feature =============

// Retrieve the Web Search default state; default to false (disabled)
function isWebSearchEnabled() {
    return GM_getValue('webSearchEnabled', false);
}

// Set the Web Search default state
function setWebSearchEnabled(enabled) {
    GM_setValue('webSearchEnabled', enabled);

    const webSearchText = getLocalizedText('Web Search', '网络搜索');
    updateButtonState('web-search-toggle', enabled, webSearchText);

    const enabledMsg = getLocalizedText('Web Search default enabled', '默认网络搜索已启用');
    const disabledMsg = getLocalizedText('Web Search default disabled', '默认网络搜索已禁用');

    showToast(enabled ? enabledMsg : disabledMsg);
    log('Web Search default state switched to:', enabled);

    if (!enabled) {
        disableWebOption();
    }
}

// Wait for a DOM element to appear
function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(selector)) {
            return resolve(document.querySelector(selector));
        }

        const observer = new MutationObserver(() => {
            if (document.querySelector(selector)) {
                observer.disconnect();
                resolve(document.querySelector(selector));
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        setTimeout(() => {
            observer.disconnect();
            reject(new Error(`Timeout waiting for element: ${selector}`));
        }, timeout);
    });
}

// Disable Web Search Option
async function disableWebOption() {
    if (isWebSearchEnabled()) {
        log('Web Search is enabled; skipping disable operation');
        return;
    }

    log('Executing Web Search disable operation');
    try {
        const sourceButton = await waitForElement('button svg[class*="tabler-icon-world"], button svg[class*="world"], button svg[class*="globe"]');
        log('Source selection button found:', sourceButton);
        sourceButton.closest('button').click();
        log('Clicked source button to open menu');
        await new Promise(resolve => setTimeout(resolve, 300));

        const webElements = document.querySelectorAll('div');
        let webToggle = null;

        // Support both English "Web" and Chinese "网络" text
        for (const el of webElements) {
            if (el.textContent) {
                const hasWebText = el.textContent.includes('Web') || el.textContent.includes('网络');
                const hasDescriptionText = el.textContent.includes('Search across') ||
                                           el.textContent.includes('搜索');

                if (hasWebText && hasDescriptionText) {
                    const toggle = el.querySelector('button[role="switch"][aria-checked="true"], [aria-checked="true"]');
                    if (toggle) {
                        webToggle = toggle;
                        break;
                    }
                }
            }
        }

        if (webToggle) {
            log('Found Web toggle switch; disabling it');
            webToggle.click();
            await new Promise(resolve => setTimeout(resolve, 300));
            document.body.click();
            log('Web option disabled; menu closed');
        } else {
            log('Web toggle switch not found or already disabled');
            document.body.click();
        }
    } catch (error) {
        log('Error in Web Search disable operation:', error);
    }
}

// ============= General UI Controls =============

// Show status toast messages
function showToast(message) {
    const existingToast = document.querySelector('.enhanced-toast');
    if (existingToast) {
        existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = 'enhanced-toast';
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.backgroundColor = '#f9f9f9';
    toast.style.color = '#333';
    toast.style.padding = '8px 16px';
    toast.style.borderRadius = '8px';
    toast.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
    toast.style.zIndex = '9999';
    toast.textContent = message;

    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
}

// Update button state based on current settings
function updateButtonState(buttonId, enabled, text) {
    const button = document.getElementById(buttonId);
    if (button) {
        button.innerHTML = text;
        button.style.backgroundColor = enabled ? '#4CAF50' : '#f44336';
    }
}

// Add control buttons to the page
function addControlButtons() {
    const directPasteText = getLocalizedText('Direct Paste', '直接粘贴');
    const webSearchText = getLocalizedText('Web Search', '网络搜索');

    if (document.getElementById('perplexity-controls')) {
        updateButtonState('paste-toggle', isDirectPasteEnabled(), directPasteText);
        updateButtonState('web-search-toggle', isWebSearchEnabled(), webSearchText);
        return;
    }

    const container = document.createElement('div');
    container.id = 'perplexity-controls';
    container.style.position = 'fixed';
    container.style.bottom = '80px';
    container.style.right = '20px';
    container.style.zIndex = '9999';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '10px';

    const pasteBtn = createControlButton('paste-toggle', directPasteText, isDirectPasteEnabled(), function() {
        const newState = !isDirectPasteEnabled();
        setDirectPasteEnabled(newState);
    });

    const webSearchBtn = createControlButton('web-search-toggle', webSearchText, isWebSearchEnabled(), function() {
        const newState = !isWebSearchEnabled();
        setWebSearchEnabled(newState);
    });

    container.appendChild(pasteBtn);
    container.appendChild(webSearchBtn);
    document.body.appendChild(container);

    log('Control buttons added');
}

// Create a control button
function createControlButton(id, text, enabled, clickHandler) {
    const button = document.createElement('button');
    button.id = id;
    button.className = 'control-button';
    button.style.padding = '8px 12px';
    button.style.borderRadius = '20px';
    button.style.border = 'none';
    button.style.color = 'white';
    button.style.cursor = 'pointer';
    button.style.fontWeight = 'bold';
    button.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
    button.style.transition = 'all 0.3s ease';
    button.innerHTML = text;
    button.style.backgroundColor = enabled ? '#4CAF50' : '#f44336';

    button.addEventListener('click', clickHandler);

    button.addEventListener('mouseover', function() {
        this.style.transform = 'scale(1.05)';
        this.style.boxShadow = '0 4px 8px rgba(0,0,0,0.3)';
    });

    button.addEventListener('mouseout', function() {
        this.style.transform = 'scale(1)';
        this.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
    });

    return button;
}

// Initialize script
function init() {
    log('Script loaded, version 3.1 with Chinese support');
    log('Interface language: ' + (isChineseInterface() ? 'Chinese' : 'English'));

    handlePasteEvent();
    setTimeout(addControlButtons, 2000);

    if (!isWebSearchEnabled()) {
        setTimeout(disableWebOption, 2500);
    }

    const style = document.createElement('style');
    style.textContent = `
        .enhanced-toast {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 14px;
            animation: toastFade 2s ease;
            z-index: 10000;
        }
        @keyframes toastFade {
            0% { opacity: 0; transform: translate(-50%, 20px); }
            10% { opacity: 1; transform: translate(-50%, 0); }
            90% { opacity: 1; transform: translate(-50%, 0); }
            100% { opacity: 0; transform: translate(-50%, -10px); }
        }
        .control-button {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 14px;
        }
    `;
    document.head.appendChild(style);

    let lastUrl = location.href;
    new MutationObserver(() => {
        if (lastUrl !== location.href) {
            lastUrl = location.href;
            log('URL changed; reinitializing');
            setTimeout(addControlButtons, 2000);
            if (!isWebSearchEnabled()) {
                setTimeout(disableWebOption, 2500);
            }
        }
    }).observe(document, { subtree: true, childList: true });

    log('Initialization complete');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    setTimeout(init, 500);
}
})();
