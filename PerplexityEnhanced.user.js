// ==UserScript==
// @name         Perplexity Enhanced - Model Switcher, Direct Paste & Web Search (简化版)
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  自动切换默认模型、直接粘贴长文本并控制网络搜索（中英文均支持），同时减少延时和资源占用
// @author       Your Name
// @match        https://www.perplexity.ai/*
// @match        https://perplexity.ai/*
// @icon         https://www.perplexity.ai/favicon.ico
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // ========= 常量与工具函数 =========
    const DEBUG = true;
    const CHUNK_SIZE = 2000;
    const DELAY_BETWEEN_CHUNKS = 20; // 缩短分片插入延时
    const availableModels = [
        "Best",
        "Sonar",
        "Claude 3.7 Sonnet",
        "Claude 3.7 Sonnet Thinking",
        "GPT-4o",
        "Gemini 2.5 Pro",
        "Grok-2",
        "R1 1776",
        "o3-mini"
    ];

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function log(...args) {
        if (DEBUG) {
            const now = new Date();
            const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
            console.log(`[Perplexity Enhanced ${timeStr}]`, ...args);
        }
    }

    // 简单判断是否中文界面
    function isChineseInterface() {
        const lang = document.documentElement.lang;
        if (lang && lang.trim().toLowerCase().startsWith('zh')) return true;
        const text = document.body.textContent || '';
        return text.includes('发现') || text.includes('空间') || text.includes('图书馆');
    }

    function getLocalizedText(enText, zhText) {
        return isChineseInterface() ? zhText : enText;
    }

    // ========= Direct Paste 功能 =========
    function isDirectPasteEnabled() {
        return GM_getValue('directPasteEnabled', true);
    }

    function setDirectPasteEnabled(enabled) {
        GM_setValue('directPasteEnabled', enabled);
        updateButtonState('paste-toggle', enabled, getLocalizedText('Direct Paste', '直接粘贴'));
        showToast(enabled ? getLocalizedText('Direct Paste mode enabled', '直接粘贴模式已启用') : getLocalizedText('Direct Paste mode disabled', '直接粘贴模式已禁用'));
        log('Direct Paste mode switched to:', enabled);
    }

    async function insertTextInChunks(textarea, text, startPos, endPos) {
        try {
            const chunks = [];
            for (let i = 0; i < text.length; i += CHUNK_SIZE) {
                chunks.push(text.substring(i, i + CHUNK_SIZE));
            }
            if (chunks.length > 1) {
                showToast(getLocalizedText(`Processing long text: ${chunks.length} chunks...`, `处理长文本：${chunks.length} 个片段...`));
                log(`Split text into ${chunks.length} chunks`);
            }
            const original = textarea.value;
            let newText = original.substring(0, startPos);
            let currentPos = startPos;
            for (let chunk of chunks) {
                newText += chunk;
                textarea.value = newText + original.substring(endPos);
                currentPos += chunk.length;
                textarea.selectionStart = textarea.selectionEnd = currentPos;
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                textarea.dispatchEvent(new Event('change', { bubbles: true }));
                await sleep(DELAY_BETWEEN_CHUNKS);
            }
            if (chunks.length > 1) {
                showToast(getLocalizedText(`Done! Inserted ${text.length} characters.`, `完成！已插入 ${text.length} 个字符。`));
                log(`Successfully inserted ${text.length} characters`);
            }
        } catch (err) {
            log('Error inserting text:', err);
            showToast(getLocalizedText('Error inserting text. Please reduce the text length or refresh the page.', '插入文本出错，请尝试缩短文本或刷新页面。'));
        }
    }

    function handlePasteEvent() {
        document.addEventListener('paste', event => {
            if (!isDirectPasteEnabled()) {
                log('Direct Paste mode disabled');
                return;
            }
            const activeElement = document.activeElement;
            if (!activeElement || activeElement.tagName !== 'TEXTAREA') {
                log('Not in a text area');
                return;
            }
            const text = (event.clipboardData || window.clipboardData).getData('text/plain');
            if (text && text.length > CHUNK_SIZE) {
                log(`Long text detected (${text.length} characters). Processing in chunks.`);
                event.stopPropagation();
                event.preventDefault();
                const start = activeElement.selectionStart;
                const end = activeElement.selectionEnd;
                insertTextInChunks(activeElement, text, start, end);
            } else {
                log('Pasted text within limit');
            }
        }, true);
        log('Paste event handler set');
    }

    // ========= Web Search 控制功能 =========
    function isWebSearchEnabled() {
        return GM_getValue('webSearchEnabled', false);
    }

    function setWebSearchEnabled(enabled) {
        GM_setValue('webSearchEnabled', enabled);
        updateButtonState('web-search-toggle', enabled, getLocalizedText('Web Search', '网络搜索'));
        showToast(enabled ? getLocalizedText('Web Search default enabled', '默认网络搜索已启用') : getLocalizedText('Web Search default disabled', '默认网络搜索已禁用'));
        log('Web Search state switched to:', enabled);
        if (!enabled) {
            // 延时 2000 毫秒后进行 Web Search 禁用
            setTimeout(disableWebOption, 2000);
        }
    }

    function waitForElement(selector, timeout = 8000) {
        return new Promise((resolve, reject) => {
            const el = document.querySelector(selector);
            if (el) return resolve(el);
            const observer = new MutationObserver(() => {
                const node = document.querySelector(selector);
                if (node) {
                    observer.disconnect();
                    resolve(node);
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => {
                observer.disconnect();
                reject(new Error(`Timeout waiting for element: ${selector}`));
            }, timeout);
        });
    }

    async function disableWebOption() {
        if (isWebSearchEnabled()) {
            log('Web Search enabled; skip disable');
            return;
        }
        log('Disabling Web Search option');
        try {
            const sourceButton = await waitForElement('button svg[class*="tabler-icon-world"], button svg[class*="world"], button svg[class*="globe"]', 8000);
            log('Found source button:', sourceButton);
            sourceButton.closest('button').click();
            await sleep(200);
            const divs = document.querySelectorAll('div');
            let webToggle = null;
            for (const el of divs) {
                if (el.textContent && (el.textContent.includes('Web') || el.textContent.includes('网络')) &&
                    (el.textContent.includes('Search across') || el.textContent.includes('搜索'))) {
                    const btn = el.querySelector('button[role="switch"][aria-checked="true"], [aria-checked="true"]');
                    if (btn) { webToggle = btn; break; }
                }
            }
            if (webToggle) {
                log('Found Web toggle. Disabling it.');
                webToggle.click();
                await sleep(200);
                document.body.click();
            } else {
                log('No active Web toggle found.');
                document.body.click();
            }
        } catch (e) {
            log('Error disabling Web Search:', e);
        }
    }

    // ========= 通用 UI 控件 =========
    function showToast(msg) {
        const old = document.querySelector('.enhanced-toast');
        if (old) old.remove();
        const toast = document.createElement('div');
        toast.className = 'enhanced-toast';
        toast.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#f9f9f9;color:#333;padding:8px 16px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.15);z-index:9999;';
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2000);
    }

    function updateButtonState(id, enabled, text) {
        const btn = document.getElementById(id);
        if (btn) {
            btn.innerHTML = text;
            btn.style.backgroundColor = enabled ? '#4CAF50' : '#f44336';
        }
    }

    function createControlButton(id, text, enabled, clickHandler) {
        const btn = document.createElement('button');
        btn.id = id;
        btn.className = 'control-button';
        btn.textContent = text;
        btn.style.cssText = 'padding:8px 12px;border-radius:20px;border:none;color:white;cursor:pointer;font-weight:bold;box-shadow:0 2px 5px rgba(0,0,0,0.2);transition:all 0.3s ease;';
        btn.style.backgroundColor = enabled ? '#4CAF50' : '#f44336';
        btn.addEventListener('click', clickHandler);
        btn.addEventListener('mouseover', function() {
            this.style.transform = 'scale(1.05)';
            this.style.boxShadow = '0 4px 8px rgba(0,0,0,0.3)';
        });
        btn.addEventListener('mouseout', function() {
            this.style.transform = 'scale(1)';
            this.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
        });
        return btn;
    }

    function addControlButtons() {
        const pasteText = getLocalizedText('Direct Paste', '直接粘贴');
        const webText = getLocalizedText('Web Search', '网络搜索');
        let container = document.getElementById('perplexity-controls');
        if (!container) {
            container = document.createElement('div');
            container.id = 'perplexity-controls';
            container.style.cssText = 'position:fixed;bottom:80px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:10px;';
            document.body.appendChild(container);
        }
        if (!document.getElementById('paste-toggle')) {
            container.appendChild(createControlButton('paste-toggle', pasteText, isDirectPasteEnabled(), () => {
                setDirectPasteEnabled(!isDirectPasteEnabled());
            }));
        } else {
            updateButtonState('paste-toggle', isDirectPasteEnabled(), pasteText);
        }
        if (!document.getElementById('web-search-toggle')) {
            container.appendChild(createControlButton('web-search-toggle', webText, isWebSearchEnabled(), () => {
                setWebSearchEnabled(!isWebSearchEnabled());
            }));
        } else {
            updateButtonState('web-search-toggle', isWebSearchEnabled(), webText);
        }
    }

    // ========= 默认模型切换功能 =========
    function updateButtonText() {
        const btn = document.getElementById('defaultModelBtn');
        if (!btn) return;
        btn.textContent = GM_getValue('defaultModel', "Default Model");
    }

    function addDefaultModelButton() {
        let container = document.getElementById('perplexity-controls');
        if (!container) {
            container = document.createElement('div');
            container.id = 'perplexity-controls';
            container.style.cssText = 'position:fixed;bottom:80px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:10px;';
            document.body.appendChild(container);
        }
        if (document.getElementById('defaultModelBtn')) return;
        const btn = createControlButton('defaultModelBtn', GM_getValue('defaultModel', "Default Model"), true, toggleModelSelectionPopup);
        container.appendChild(btn);
    }

    function addModelSelectionPopup() {
        if (document.getElementById('modelSelectionPopup')) return;
        const popup = document.createElement('div');
        popup.id = 'modelSelectionPopup';
        popup.innerHTML = `
            <h3 style="margin:0 0 15px 0;font-size:16px;">${getLocalizedText('Set Default Perplexity Model', '设置默认 Perplexity 模型')}</h3>
            <select id="modelSelect" style="width:100%;padding:8px;margin-bottom:15px;background:#333;color:white;border:1px solid #444;border-radius:4px;"></select>
            <button id="saveModelBtn" style="background:#4CAF50;color:white;border:none;border-radius:4px;padding:8px 12px;cursor:pointer;font-weight:bold;">
                ${getLocalizedText('Save Settings', '保存设置')}
            </button>
        `;
        const select = popup.querySelector('#modelSelect');
        availableModels.forEach(model => {
            const opt = document.createElement('option');
            opt.value = model;
            opt.textContent = model;
            select.appendChild(opt);
        });
        const savedModel = GM_getValue('defaultModel');
        if (savedModel) select.value = savedModel;
        document.body.appendChild(popup);
        popup.querySelector('#saveModelBtn').addEventListener('click', saveDefaultModel);
    }

    function toggleModelSelectionPopup() {
        const popup = document.getElementById('modelSelectionPopup');
        if (!popup) return;
        popup.style.display = (popup.style.display === 'none' || popup.style.display === '') ? 'block' : 'none';
    }

    function saveDefaultModel() {
        const select = document.getElementById('modelSelect');
        const model = select.value;
        GM_setValue('defaultModel', model);
        document.getElementById('modelSelectionPopup').style.display = 'none';
        updateButtonText();
        setTimeout(() => switchToModel(model, true), 1000);
    }

    function clickCpuButton() {
        const buttons = document.querySelectorAll('button:has(svg.tabler-icon-cpu), button:has(svg[class*="tabler"][class*="cpu"])');
        if (buttons.length) { buttons[0].click(); return true; }
        const smalls = Array.from(document.querySelectorAll('button')).filter(btn => {
            const r = btn.getBoundingClientRect();
            return r.width < 50 && r.height < 50 && btn.querySelector('svg');
        });
        if (smalls.length) { smalls[0].click(); return true; }
        return false;
    }

    function clickModelOption(modelName) {
        const els = [
            ...document.querySelectorAll('span'),
            ...document.querySelectorAll('div[role="option"]'),
            ...document.querySelectorAll('li[role="option"]')
        ];
        for (let el of els) {
            if (el.textContent.trim() === modelName) {
                const btn = el.closest('button, div[role="option"], li, [role="menuitem"]');
                if (btn) { btn.click(); return true; }
                el.click();
                return true;
            }
        }
        for (let el of els) {
            if (el.textContent.includes(modelName)) {
                const btn = el.closest('button, div[role="option"], li, [role="menuitem"]');
                if (btn) { btn.click(); return true; }
                el.click();
                return true;
            }
        }
        return false;
    }

    function switchToModel(modelName, isSecondAttempt = false) {
        if (!clickCpuButton()) {
            // 移除了找不到模型选择按钮时的提示
            return;
        }
        setTimeout(() => {
            if (!clickModelOption(modelName) && !isSecondAttempt) {
                // 移除了未找到指定模型时的提示
            }
        }, 200);
    }

    function switchToDefaultModel() {
        const dm = GM_getValue('defaultModel');
        if (!dm) return;
        setTimeout(() => switchToModel(dm), 700);
    }

    // ========= 初始化及样式 =========
    function addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .enhanced-toast {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 14px;
                animation: toastFade 2s ease;
                z-index: 10000;
            }
            @keyframes toastFade {
                0% { opacity: 0; transform: translate(-50%,20px); }
                10% { opacity: 1; transform: translate(-50%,0); }
                90% { opacity: 1; transform: translate(-50%,0); }
                100% { opacity: 0; transform: translate(-50%,-10px); }
            }
            .control-button {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 14px;
            }
            #perplexity-controls {
                position: fixed;
                bottom: 80px;
                right: 20px;
                z-index: 9999;
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            #modelSelectionPopup {
                position: fixed;
                bottom: 130px;
                right: 20px;
                background: #202123;
                color: white;
                border-radius: 8px;
                padding: 15px;
                z-index: 10000;
                width: 280px;
                display: none;
                box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            }
        `;
        document.head.appendChild(style);
    }

    function init() {
        log('Script loaded (简化版), interface:', isChineseInterface() ? 'Chinese' : 'English');
        handlePasteEvent();
        addControlButtons();
        addDefaultModelButton();
        addModelSelectionPopup();
        switchToDefaultModel();
        if (!isWebSearchEnabled()) {
            setTimeout(disableWebOption, 2000);
        }
        let lastUrl = location.href;
        let debounceTimer;
        new MutationObserver(() => {
            if (lastUrl !== location.href) {
                lastUrl = location.href;
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    addControlButtons();
                    addDefaultModelButton();
                    switchToDefaultModel();
                    if (!isWebSearchEnabled()) setTimeout(disableWebOption, 2000);
                }, 1500);
            }
        }).observe(document, { subtree: true, childList: true });
        log('Initialization complete');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { addStyles(); init(); });
    } else {
        addStyles();
        init();
    }
})();
