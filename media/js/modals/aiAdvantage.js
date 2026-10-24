/**
 * VenEl File Manager - AI Advantage & Intelligence
 * Context injectors, token estimator, and AI assistant prompt generator.
 */
// ✨ VENEL AI ADVANTAGE: CONTEXT INJECTOR & TOKEN INTELLIGENCE
// ══════════════════════════════════════════════════════════

let currentAiContext = {
    name: '',
    path: '',
    isDir: false,
    size: 0,
    lines: 0,
    tokens: 0,
    content: '',
    diff: '',
    extension: ''
};

let lastHoveredItem = null;
let currentAiPreset = 'explain';

function estimateTokens(text) {
    if (!text || text.length === 0) return 0;
    // BPE heuristic approximation for code & natural language
    const matches = text.match(/[\w]+|[^\s\w]|\s+/g);
    if (!matches) return Math.max(1, Math.ceil(text.length / 3.8));
    let count = 0;
    for (let i = 0; i < matches.length; i++) {
        const m = matches[i];
        if (/^\s+$/.test(m)) {
            count += Math.ceil(m.length / 4);
        } else if (m.length > 4) {
            count += Math.ceil(m.length / 3.4);
        } else {
            count += 1;
        }
    }
    return Math.max(1, count);
}

function formatTokenCount(tokens) {
    if (!tokens || tokens <= 0) return '0 tokens';
    if (tokens < 1000) return tokens + ' tokens';
    if (tokens < 1000000) return (tokens / 1000).toFixed(1).replace(/\.0$/, '') + 'k tokens';
    return (tokens / 1000000).toFixed(2).replace(/\.00$/, '') + 'M tokens';
}

function getTokenContextHealth(tokens) {
    // Relative to standard 128k context window (GPT-4o, Claude 3.5 Sonnet)
    const maxContext = 128000;
    const ratio = tokens / maxContext;
    const widthPct = Math.min(100, Math.max(2, Math.round(ratio * 100)));
    let pctStr = (ratio * 100).toFixed(1) + '%';
    if (ratio < 0.01) pctStr = '<1%';

    let healthClass = 'compact';
    if (tokens > 32000) healthClass = 'heavy';
    else if (tokens > 8000) healthClass = 'moderate';

    return { class: healthClass, pctStr: pctStr, widthPct: widthPct };
}

function updatePreviewTokenBadge(tokens, isDir, fullPath) {
    const tokenBadge = document.getElementById('preview-header-tokens');
    const askAiBtn = document.getElementById('preview-ask-ai-btn');
    const qlTokenPill = document.getElementById('ql-token-pill');

    if (tokens > 0) {
        const health = getTokenContextHealth(tokens);
        const formatted = '✨ ~' + formatTokenCount(tokens);
        if (tokenBadge) {
            tokenBadge.textContent = formatted;
            tokenBadge.className = 'token-pill ' + health.class;
            tokenBadge.title = `Estimated LLM Tokens: ~${tokens.toLocaleString()} (${health.pctStr} of 128k context)`;
            tokenBadge.style.display = 'inline-flex';
        }
        if (qlTokenPill) {
            qlTokenPill.textContent = formatted;
            qlTokenPill.className = 'token-pill ' + health.class;
            qlTokenPill.style.display = 'inline-flex';
        }
        if (askAiBtn) {
            askAiBtn.style.display = 'inline-flex';
        }
    } else {
        if (tokenBadge) tokenBadge.style.display = 'none';
        if (qlTokenPill) qlTokenPill.style.display = 'none';
        if (askAiBtn) askAiBtn.style.display = isDir ? 'inline-flex' : 'none';
    }
}

const AI_PROMPT_PRESETS = {
    explain: "Analyze this file. Provide a comprehensive architectural overview, core responsibilities, public APIs, key control flows, and dependencies.",
    tests: "Generate exhaustive unit tests covering all functions, boundary conditions, edge cases, and mocked dependencies in this file.",
    review: "Review this code for performance bottlenecks, security vulnerabilities, memory leak hazards, anti-patterns, and recommend concrete modernizations.",
    docs: "Generate complete, production-grade documentation and docstrings for all classes, methods, parameters, and types in this file.",
    bugs: "Perform a rigorous static analysis to find potential runtime exceptions, race conditions, unhandled null references, or edge case failures in this code.",
    refactor: "Analyze this file and recommend refactoring opportunities to simplify complexity, enhance readability, and adhere to clean code principles."
};

async function openAiAssistantModal(targetItem) {
    hideContextMenu();
    const item = targetItem || selectedItem || (currentItems.length > 0 ? currentItems[0] : null);
    if (!item) {
        showToast('Select a file or folder first to ask AI', '✨');
        return;
    }

    const isDir = item.type === 'Directory';
    const sep = isWindows ? '\\' : '/';
    const fullPath = item.path || (currentPath.endsWith(sep) ? currentPath + item.name : currentPath + sep + item.name);

    currentAiContext = {
        name: item.name,
        path: fullPath,
        isDir: isDir,
        size: item.size || 0,
        lines: 0,
        tokens: 0,
        content: '',
        diff: '',
        extension: item.name.includes('.') ? item.name.split('.').pop().toLowerCase() : ''
    };

    // UI Updates
    const visual = getFileVisual(item.name, isDir);
    const aiIconEl = document.getElementById('ai-target-icon');
    if (aiIconEl) {
        if (visual.svg) aiIconEl.innerHTML = visual.svg;
        else aiIconEl.textContent = visual.icon;
    }
    document.getElementById('ai-target-name').textContent = item.name;
    document.getElementById('ai-target-meta').textContent = isDir ? 'Directory' : formatBytes(item.size || 0);

    const tokenCountEl = document.getElementById('ai-target-tokens');
    const tokenMeterBar = document.getElementById('ai-token-meter-bar');
    const tokenSubtext = document.getElementById('ai-token-subtext');
    tokenCountEl.textContent = '✨ Calculating...';
    tokenMeterBar.style.width = '2%';
    tokenSubtext.textContent = 'Analyzing tokens...';

    // Check git diff option
    const diffRow = document.getElementById('ai-diff-option-row');
    const diffCheckbox = document.getElementById('ai-include-diff');
    const gitCode = currentGitStatuses ? currentGitStatuses[item.name] : null;
    if (gitCode && gitCode === 'M') {
        diffRow.style.display = 'inline-flex';
        diffCheckbox.checked = true;
    } else {
        diffRow.style.display = 'none';
        diffCheckbox.checked = false;
    }

    // Set default preset
    selectAiPreset('explain');

    const modal = document.getElementById('modal-ai-assistant');
    modal.style.display = 'flex';

    // Fetch context from server
    try {
        const res = await fetch('/api/files/ai/context?path=' + encodeURIComponent(fullPath));
        if (res.ok) {
            const data = await res.json();
            if (data && data.ok) {
                currentAiContext.tokens = data.estimatedTokens || 0;
                currentAiContext.lines = data.totalLines || data.lineCount || 0;
                currentAiContext.content = data.content || data.snippet || '';

                const metaStr = isDir 
                    ? `${data.totalCodeFiles || 0} code files • ${currentAiContext.lines.toLocaleString()} lines`
                    : `${currentAiContext.lines.toLocaleString()} lines • ${formatBytes(data.size || 0)}`;
                document.getElementById('ai-target-meta').textContent = metaStr;

                const health = getTokenContextHealth(currentAiContext.tokens);
                tokenCountEl.textContent = '✨ ~' + formatTokenCount(currentAiContext.tokens);
                tokenMeterBar.style.width = health.widthPct + '%';
                tokenSubtext.textContent = `${health.pctStr} of 128k context`;
            }
        }
    } catch {}

    // Fetch diff if modified
    if (gitCode && gitCode === 'M') {
        try {
            const diffRes = await fetch('/api/files/diff?fileA=' + encodeURIComponent(fullPath) + '&fileB=HEAD');
            if (diffRes.ok) {
                const diffData = await diffRes.json();
                if (diffData && diffData.lines) {
                    currentAiContext.diff = diffData.lines.map(l => (l.type === 'add' ? '+ ' : (l.type === 'remove' ? '- ' : '  ')) + l.text).join('\n');
                }
            }
        } catch {}
    }

    updateAiPromptPreview();
}

function openAiAssistantFromHover(event) {
    if (event) event.stopPropagation();
    hideHoverCard();
    openAiAssistantModal(lastHoveredItem);
}

function openAiAssistantFromQuickLook() {
    closeQuickLook();
    openAiAssistantModal();
}

function closeAiAssistantModal(event) {
    if (event && event.target && event.target.id !== 'modal-ai-assistant' && !event.target.classList.contains('modal-close-btn') && !event.target.closest('.modal-close-btn')) {
        return;
    }
    const modal = document.getElementById('modal-ai-assistant');
    if (modal) modal.style.display = 'none';
}

function selectAiPreset(presetKey, btnElem) {
    currentAiPreset = presetKey;
    document.querySelectorAll('.ai-preset-chip').forEach(el => el.classList.remove('active'));
    if (btnElem) {
        btnElem.classList.add('active');
    } else {
        const found = document.querySelector(`.ai-preset-chip[onclick*="'${presetKey}'"]`);
        if (found) found.classList.add('active');
    }

    const input = document.getElementById('ai-prompt-input');
    if (input) {
        input.value = AI_PROMPT_PRESETS[presetKey] || AI_PROMPT_PRESETS.explain;
    }
    updateAiPromptPreview();
}

function buildAiPayloadText() {
    const promptInput = document.getElementById('ai-prompt-input');
    const userPrompt = (promptInput ? promptInput.value.trim() : '') || AI_PROMPT_PRESETS[currentAiPreset];
    const includeContent = document.getElementById('ai-include-content')?.checked;
    const includeDiff = document.getElementById('ai-include-diff')?.checked;

    let payload = `${userPrompt}\n\n`;
    payload += `--- File Context ---\n`;
    payload += `File: ${currentAiContext.name}\n`;
    payload += `Path: ${currentAiContext.path}\n`;
    if (currentAiContext.lines > 0) payload += `Lines: ${currentAiContext.lines}\n`;
    if (currentAiContext.tokens > 0) payload += `Estimated Tokens: ~${currentAiContext.tokens.toLocaleString()}\n`;
    payload += `--------------------\n\n`;

    if (includeDiff && currentAiContext.diff) {
        payload += `### Git Diff (Recent Changes against HEAD)\n\`\`\`diff\n${currentAiContext.diff}\n\`\`\`\n\n`;
    }

    if (includeContent && currentAiContext.content) {
        const lang = currentAiContext.extension || 'text';
        payload += `### Source Content\n\`\`\`${lang}\n${currentAiContext.content}\n\`\`\`\n`;
    }

    return payload;
}

function updateAiPromptPreview() {
    const payload = buildAiPayloadText();
    const codeEl = document.getElementById('ai-payload-code');
    if (codeEl) {
        codeEl.textContent = payload;
    }
}

async function copyAiPromptAndContext() {
    const payload = buildAiPayloadText();
    try {
        await navigator.clipboard.writeText(payload);
        showToast('Prompt & code context copied to clipboard! (Ready to paste)', '✨');
    } catch {
        if (window.parent && window.parent.postMessage) {
            window.parent.postMessage({ command: 'copyToClipboard', text: payload }, '*');
        }
        showToast('Prompt & code context copied to clipboard!', '✨');
    }
}

async function sendToMcpAssistant() {
    const payload = buildAiPayloadText();
    const promptInput = document.getElementById('ai-prompt-input');
    const userPrompt = (promptInput ? promptInput.value.trim() : '') || AI_PROMPT_PRESETS[currentAiPreset];

    // 1. Post to VS Code Extension Host
    if (window.parent && window.parent.postMessage) {
        window.parent.postMessage({
            command: 'askAi',
            prompt: userPrompt,
            fullText: payload,
            fileName: currentAiContext.name,
            filePath: currentAiContext.path,
            tokenCount: currentAiContext.tokens
        }, '*');
    }

    // 2. Also ensure it is in clipboard
    try {
        await navigator.clipboard.writeText(payload);
    } catch {}

    showToast(`Context sent to MCP Assistant (~${currentAiContext.tokens.toLocaleString()} tokens)`, '✨');
    closeAiAssistantModal();
}