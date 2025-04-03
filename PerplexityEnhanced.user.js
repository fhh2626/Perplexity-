// ==UserScript==
// @name         Perplexity Enhanced - Direct Paste & Web Search Control
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  在Perplexity中粘贴长文本并控制Web搜索默认设置
// @author       You
// @match        https://www.perplexity.ai/*
// @match        https://perplexity.ai/*
// @icon         https://www.perplexity.ai/favicon.ico
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // 调试模式 - 设置为true可在控制台查看详细日志
    const DEBUG = true;

    // 每个块的最大字符数（避免触发附件转换的阈值）
    const CHUNK_SIZE = 2000;

    // 块之间的延迟（毫秒）
    const DELAY_BETWEEN_CHUNKS = 30;

    // 日志函数 - 添加时间戳
    function log(...args) {
        if (DEBUG) {
            const now = new Date();
            const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
            console.log(`[Perplexity增强 ${timeStr}]`, ...args);
        }
    }

    // ============= 直接粘贴功能 =============

    // 使用GM_getValue获取直接粘贴设置，如果不存在则默认为true
    function isDirectPasteEnabled() {
        return GM_getValue('directPasteEnabled', true);
    }

    // 设置直接粘贴功能开关状态
    function setDirectPasteEnabled(enabled) {
        GM_setValue('directPasteEnabled', enabled);
        updateButtonState('paste-toggle', enabled, '直接粘贴');
        showToast(enabled ? '直接粘贴模式已启用' : '直接粘贴模式已关闭');
        log('直接粘贴模式状态切换为:', enabled);
    }

    // 分块插入文本
    async function insertTextInChunks(textarea, text, startPos, endPos) {
        try {
            // 分割文本为更小的块
            const chunks = [];
            for (let i = 0; i < text.length; i += CHUNK_SIZE) {
                chunks.push(text.substring(i, i + CHUNK_SIZE));
            }

            // 显示进度提示
            if (chunks.length > 1) {
                showToast(`处理长文本: 分为 ${chunks.length} 个块...`);
                log(`分割文本为 ${chunks.length} 个块`);
            }

            const originalText = textarea.value;
            let newText = originalText.substring(0, startPos);
            let currentPos = startPos;

            // 逐块插入文本
            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];

                // 插入当前块
                newText += chunk;
                textarea.value = newText + originalText.substring(endPos);

                // 更新光标位置
                currentPos += chunk.length;
                textarea.selectionStart = textarea.selectionEnd = currentPos;

                // 触发必要的事件以更新UI和通知应用变化
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                textarea.dispatchEvent(new Event('change', { bubbles: true }));

                // 等待一小段时间再插入下一块
                if (i < chunks.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_CHUNKS));
                }
            }

            if (chunks.length > 1) {
                showToast(`完成! 已插入 ${text.length} 个字符。`);
                log(`已成功插入 ${text.length} 个字符`);
            }
        } catch (error) {
            log('插入文本时出错:', error);
            showToast('插入文本时出错，请尝试减小文本量或刷新页面');
        }
    }

    // 处理粘贴事件
    function handlePasteEvent() {
        document.addEventListener('paste', function(event) {
            // 只有在启用直接粘贴模式时才拦截
            if (!isDirectPasteEnabled()) {
                log('直接粘贴模式未启用，不拦截粘贴事件');
                return;
            }

            // 确保焦点在文本区域
            const activeElement = document.activeElement;
            if (!activeElement || activeElement.tagName !== 'TEXTAREA') {
                log('焦点不在文本区域，不处理粘贴事件');
                return;
            }

            // 获取粘贴的文本
            const clipboardData = event.clipboardData || window.clipboardData;
            const pastedText = clipboardData.getData('text/plain');

            // 对较长文本进行特殊处理
            if (pastedText && pastedText.length > CHUNK_SIZE) {
                log(`检测到长文本粘贴 (${pastedText.length} 字符)，启动分块处理`);

                // 阻止默认粘贴行为
                event.stopPropagation();
                event.preventDefault();

                // 获取当前选中区域
                const start = activeElement.selectionStart;
                const end = activeElement.selectionEnd;

                // 分块插入文本
                insertTextInChunks(activeElement, pastedText, start, end);
            } else {
                log('文本长度在阈值内，使用默认粘贴行为');
            }
        }, true); // 捕获阶段拦截

        log('粘贴事件处理器已设置');
    }

    // ============= Web搜索控制功能 =============

    // 获取Web搜索默认状态设置，默认为false（关闭状态）
    function isWebSearchEnabled() {
        return GM_getValue('webSearchEnabled', false);
    }

    // 设置Web搜索默认状态
    function setWebSearchEnabled(enabled) {
        GM_setValue('webSearchEnabled', enabled);
        updateButtonState('web-search-toggle', enabled, '默认搜索');
        showToast(enabled ? 'Web搜索已默认启用' : 'Web搜索已默认禁用');
        log('Web搜索默认状态切换为:', enabled);

        // 如果设置为禁用，则执行禁用操作
        if (!enabled) {
            disableWebOption();
        }
    }

    // 等待DOM元素出现
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

    // 主函数：处理Web选项
    async function disableWebOption() {
        // 如果Web搜索已设置为启用，则不禁用它
        if (isWebSearchEnabled()) {
            log('Web搜索设置为启用状态，不进行禁用操作');
            return;
        }

        log('执行Web搜索禁用操作');

        try {
            // 等待源选择按钮出现 (地球图标按钮)
            const sourceButton = await waitForElement('button svg[class*="tabler-icon-world"], button svg[class*="world"], button svg[class*="globe"]');
            log('找到源选择按钮:', sourceButton);

            // 点击源按钮打开菜单
            sourceButton.closest('button').click();
            log('点击源按钮打开菜单');

            // 等待Web选项显示
            await new Promise(resolve => setTimeout(resolve, 300));

            // 查找Web切换开关 - 通过文本和结构定位
            const webElements = document.querySelectorAll('div');
            let webToggle = null;

            for (const el of webElements) {
                if (el.textContent && el.textContent.includes('Web') && el.textContent.includes('Search across')) {
                    // 找到包含Web标签的元素，现在寻找其中的切换按钮
                    const toggle = el.querySelector('button[role="switch"][aria-checked="true"], [aria-checked="true"]');
                    if (toggle) {
                        webToggle = toggle;
                        break;
                    }
                }
            }

            // 如果找到了Web切换开关并且它是开启的，点击它
            if (webToggle) {
                log('找到Web切换开关，关闭它');
                webToggle.click();

                // 等待一下，然后关闭菜单
                await new Promise(resolve => setTimeout(resolve, 300));

                // 点击页面其他位置关闭菜单
                document.body.click();
                log('Web选项已关闭，菜单已关闭');
            } else {
                log('未找到Web切换开关或已经关闭');
                // 关闭菜单
                document.body.click();
            }
        } catch (error) {
            log('Web搜索禁用操作出错:', error);
        }
    }

    // ============= 通用UI控制功能 =============

    // 显示状态提示
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

        // 2秒后移除提示
        setTimeout(() => toast.remove(), 2000);
    }

    // 更新按钮状态以匹配当前设置
    function updateButtonState(buttonId, enabled, text) {
        const button = document.getElementById(buttonId);
        if (button) {
            button.innerHTML = text;
            button.style.backgroundColor = enabled ? '#4CAF50' : '#f44336'; // 绿色表示启用，红色表示禁用
        }
    }

    // 添加控制按钮到页面
    function addControlButtons() {
        // 检查是否已经添加了控制按钮
        if (document.getElementById('perplexity-controls')) {
            // 只更新按钮状态
            updateButtonState('paste-toggle', isDirectPasteEnabled(), '直接粘贴');
            updateButtonState('web-search-toggle', isWebSearchEnabled(), '默认搜索');
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

        // 直接粘贴控制按钮
        const pasteBtn = createControlButton('paste-toggle', '直接粘贴', isDirectPasteEnabled(), function() {
            const newState = !isDirectPasteEnabled();
            setDirectPasteEnabled(newState);
        });

        // Web搜索控制按钮
        const webSearchBtn = createControlButton('web-search-toggle', '默认搜索', isWebSearchEnabled(), function() {
            const newState = !isWebSearchEnabled();
            setWebSearchEnabled(newState);
        });

        // 添加到页面
        container.appendChild(pasteBtn);
        container.appendChild(webSearchBtn);
        document.body.appendChild(container);

        log('已添加控制按钮');
    }

    // 创建控制按钮
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
        button.style.backgroundColor = enabled ? '#4CAF50' : '#f44336'; // 绿色表示启用，红色表示禁用

        // 添加事件监听器
        button.addEventListener('click', clickHandler);

        // 添加悬停效果
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

    // 初始化
    function init() {
        log('脚本已加载，版本 3.0');

        // 设置粘贴事件处理
        handlePasteEvent();

        // 添加控制按钮
        setTimeout(addControlButtons, 2000);

        // 如果Web搜索设置为禁用状态，则执行禁用操作
        if (!isWebSearchEnabled()) {
            setTimeout(disableWebOption, 2500);
        }

        // 注入样式
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

        // 监听URL变化，当导航到新页面时重新执行Web搜索禁用操作
        let lastUrl = location.href;
        new MutationObserver(() => {
            if (lastUrl !== location.href) {
                lastUrl = location.href;
                log('URL变化，重新执行初始化');
                // 重新添加控制按钮（或更新状态）
                setTimeout(addControlButtons, 2000);
                // 如果Web搜索设置为禁用状态，则执行禁用操作
                if (!isWebSearchEnabled()) {
                    setTimeout(disableWebOption, 2500);
                }
            }
        }).observe(document, {subtree: true, childList: true});

        log('初始化完成');
    }

    // 页面加载完成后启动
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // 稍微延迟初始化，确保Perplexity页面完全加载
        setTimeout(init, 500);
    }
})();
