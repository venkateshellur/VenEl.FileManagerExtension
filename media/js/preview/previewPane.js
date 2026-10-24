/**
 * VenEl File Manager - Preview Pane & In-line Editor
 * Rich preview (Markdown, Code, Media, PDF), Decompiler, and Inline Editor.
 */
// ══════════════════════════════════════════════════════════
// 📊 RICH PREVIEW SYSTEM (CSV, Excel, Word, PDF, Media, Markdown)
// ══════════════════════════════════════════════════════════
let activeWorkbookMap = new Map();
let xlsxLoadingPromise = null;
let mammothLoadingPromise = null;

let activePdfMap = new Map();
let pdfjsLoadingPromise = null;

function ensurePdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (pdfjsLoadingPromise) return pdfjsLoadingPromise;
    pdfjsLoadingPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        s.onload = () => {
            try {
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            } catch (e) {}
            resolve(window.pdfjsLib);
        };
        s.onerror = (e) => reject(new Error('PDF viewer requires an active internet connection to load PDF engine.'));
        document.head.appendChild(s);
    });
    return pdfjsLoadingPromise;
}

async function renderPdfPage(uniqueId, pageNum) {
    const state = activePdfMap.get(uniqueId);
    if (!state) return;
    if (pageNum < 1 || pageNum > state.totalPages) return;
    state.pageNum = pageNum;

    const container = document.getElementById(uniqueId);
    if (!container) return;

    const indicator = container.querySelector('.pdf-page-indicator');
    if (indicator) indicator.innerText = pageNum + ' / ' + state.totalPages;

    const viewportElem = container.querySelector('.pdf-scroll-viewport');
    const canvas = container.querySelector('.pdf-canvas');
    if (!canvas || !viewportElem) return;

    try {
        const page = await state.doc.getPage(pageNum);
        const unscaledViewport = page.getViewport({ scale: 1.0 });

        // Calculate base scale to fit container width smoothly
        const containerWidth = Math.max(160, (viewportElem.clientWidth || (state.isQuickLook ? 750 : 280)) - 24);
        const baseScale = containerWidth / unscaledViewport.width;
        const finalScale = baseScale * (state.scale || 1.0);
        const viewport = page.getViewport({ scale: finalScale });

        const outputScale = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = Math.floor(viewport.width) + 'px';
        canvas.style.height = Math.floor(viewport.height) + 'px';

        const ctx = canvas.getContext('2d');
        ctx.save();
        ctx.scale(outputScale, outputScale);

        const renderContext = {
            canvasContext: ctx,
            viewport: viewport
        };

        if (state.renderTask) {
            try { state.renderTask.cancel(); } catch (e) {}
        }
        state.renderTask = page.render(renderContext);
        await state.renderTask.promise;
        ctx.restore();
    } catch (err) {
        if (err && err.name === 'RenderingCancelledException') return;
        console.error('PDF page render error:', err);
    }
}

function changePdfPage(uniqueId, delta) {
    const state = activePdfMap.get(uniqueId);
    if (!state) return;
    const next = state.pageNum + delta;
    if (next >= 1 && next <= state.totalPages) {
        renderPdfPage(uniqueId, next);
    }
}

function zoomPdf(uniqueId, delta) {
    const state = activePdfMap.get(uniqueId);
    if (!state) return;
    state.scale = Math.max(0.4, Math.min(3.5, (state.scale || 1.0) + delta));
    renderPdfPage(uniqueId, state.pageNum);
}

const knownBinaryExts = [
    'zip', 'gz', 'tar', 'bz2', '7z', 'rar', 'dmg', 'iso', 'exe', 'dll', 'so', 'dylib',
    'bin', 'dat', 'db', 'sqlite', 'sqlite3', 'class', 'pyc', 'o', 'obj', 'lib', 'a',
    'wasm', 'jar', 'war', 'ear', 'pkg', 'deb', 'rpm', 'apk', 'ipa',
    'psd', 'ai', 'sketch', 'blend', 'fbx', 'ttf', 'otf', 'woff', 'woff2', 'eot'
];

function renderBinaryFileCard(name, ext, fullPath, icon, typeLabel, note) {
    icon = icon || '📦';
    typeLabel = typeLabel || 'Binary File';
    return '<div class="media-preview-box" style="padding: 24px 16px;">' +
        '<div class="media-icon-badge">' + icon + '</div>' +
        '<div style="font-size: 15px; font-weight: 600; color: #fff; word-break: break-all;">' + escapeHtml(name) + '</div>' +
        '<div class="preview-meta-pill" style="margin-top: 6px;">' + escapeHtml(typeLabel) + (ext ? ' • ' + ext.toUpperCase() : '') + '</div>' +
        (note ? '<div style="font-size: 11px; color: var(--text-muted); margin-top: 8px; max-width: 320px; line-height: 1.4;">' + escapeHtml(note) + '</div>' : '') +
        '<div style="display: flex; gap: 8px; margin-top: 18px; flex-wrap: wrap; justify-content: center;">' +
        '<button class="modal-btn confirm" onclick="openSelectedItemInEditor(\'' + escapePath(fullPath) + '\')">🚀 Open in Editor</button>' +
        '<button class="modal-btn" onclick="revealSelectedItemInOS()">📂 Reveal in Finder</button>' +
        '</div>' +
        '</div>';
}

// ══════════════════════════════════════════════════════════
// ⚡ DECOMPILER HELPER FUNCTIONS
// ══════════════════════════════════════════════════════════
async function renderDecompilerCard(name, ext, fullPath, isQuickLook, targetElem) {
    const uniqueId = 'decomp_' + Math.random().toString(36).substring(2, 9);
    targetElem.innerHTML = '<div class="media-preview-box" style="padding: 24px 16px;">' +
        '<div class="spinner" style="margin: 0 auto 12px;"></div>' +
        '<div style="font-size: 14px; font-weight: 600; color: #fff;">Decompiling & Inspecting...</div>' +
        '<div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Analyzing ' + escapeHtml(name) + ' bytecode</div>' +
        '</div>';

    try {
        const res = await fetch('/api/files/decompile?path=' + encodeURIComponent(fullPath));
        if (!res.ok) throw new Error('Backend responded with HTTP ' + res.status);
        const data = await res.json();

        if (!data.isSuccess) {
            targetElem.innerHTML = renderBinaryFileCard(name, ext, fullPath, '📦', data.format || 'Binary File', data.errorMessage || 'Decompilation not supported for this binary.');
            return;
        }

        const icon = ext === 'class' || ext === 'jar' || ext === 'war' ? '☕' : 
                     ext === 'wasm' ? '🕸️' : 
                     (ext === 'dylib' || ext === 'so' ? '⚙️' : '⚡');
        const formatLabel = data.format || (ext.toUpperCase() + ' Binary');
        const targetFw = data.targetFramework ? ' • ' + escapeHtml(data.targetFramework) : '';
        const arch = data.architecture ? ' • ' + escapeHtml(data.architecture) : '';

        // Dependencies Pills
        let depsHtml = '';
        if (data.dependencies && data.dependencies.length > 0) {
            depsHtml = '<div style="margin-top: 6px;"><div style="font-size: 10px; font-weight: 600; text-transform: uppercase; color: var(--text-muted); margin-bottom: 3px;">Dependencies / References:</div>' +
                '<div class="decompile-dep-pills">' +
                data.dependencies.map(d => '<span class="decompile-dep-pill">' + escapeHtml(d) + '</span>').join('') +
                '</div></div>';
        }

        // Type Outline Tree
        let outlineHtml = '';
        if (data.outline && data.outline.length > 0) {
            outlineHtml = renderOutlineTree(data.outline, uniqueId);
        } else {
            outlineHtml = '<div style="padding: 12px; color: var(--text-muted); font-size: 11px;">No type metadata available.</div>';
        }

        // Decompiled Code snippet & IL snippet
        const codeSnippet = data.decompiledCode || '// No decompiled source available.';
        const ilSnippet = data.intermediateLanguageCode || '// No IL / bytecode disassembly available.';

        targetElem.innerHTML = '<div class="decompile-container" id="' + uniqueId + '">' +
            // Header Card
            '<div class="decompile-header-card">' +
                '<div class="decompile-badge-row">' +
                    '<span class="decompile-title">' + icon + ' ' + escapeHtml(name) + '</span>' +
                    '<span class="preview-badge">' + escapeHtml(formatLabel) + targetFw + arch + '</span>' +
                '</div>' +
                (data.deterministicSummary ? '<div class="decompile-summary-box"><strong>📋 Summary:</strong> ' + escapeHtml(data.deterministicSummary) + '</div>' : '') +
                depsHtml +
                '<div style="display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap;">' +
                    '<button class="modal-btn" style="font-size: 11px; padding: 4px 8px;" onclick="copyDecompileSummary(\'' + uniqueId + '\')">✨ Copy AI Prompt</button>' +
                    '<button class="modal-btn" style="font-size: 11px; padding: 4px 8px;" onclick="copyDecompiledCode(\'' + uniqueId + '\')">📋 Copy Source</button>' +
                    '<button class="modal-btn" style="font-size: 11px; padding: 4px 8px;" onclick="copyDecompiledIL(\'' + uniqueId + '\')">⚡ Copy IL</button>' +
                    '<button class="modal-btn" style="font-size: 11px; padding: 4px 8px; background: rgba(108, 92, 231, 0.25); border-color: #6c5ce7; color: #a29bfe;" onclick="showExportProjectModal(\'' + uniqueId + '\', \'' + escapePath(fullPath) + '\')">📦 Export Project</button>' +
                    '<button class="modal-btn" style="font-size: 11px; padding: 4px 8px;" onclick="openSelectedItemInEditor(\'' + escapePath(fullPath) + '\')">🚀 Open File</button>' +
                '</div>' +
            '</div>' +
            // Tabs
            '<div class="decompile-tab-bar">' +
                '<button class="decompile-tab-btn active" data-tab="outline" onclick="switchDecompileTab(\'' + uniqueId + '\', \'outline\')">📋 Outline (' + (data.outline ? data.outline.length : 0) + ')</button>' +
                '<button class="decompile-tab-btn" data-tab="code" onclick="switchDecompileTab(\'' + uniqueId + '\', \'code\')" title="Decompiled High-Level Source Code">💻 Source</button>' +
                '<button class="decompile-tab-btn" data-tab="il" onclick="switchDecompileTab(\'' + uniqueId + '\', \'il\')" title="Raw Low-Level IL / Bytecode Disassembly">⚡ Bytecode</button>' +
                '<button class="decompile-tab-btn decompile-split-btn" id="' + uniqueId + '_split_btn" onclick="toggleDecompileSplitView(\'' + uniqueId + '\')" title="Side-by-side Source & Bytecode view">◫ Split View</button>' +
            '</div>' +
            // Tab Content 1: Outline Tree
            '<div class="decompile-tab-content" id="' + uniqueId + '_outline">' +
                '<div class="decompile-filter-bar">' +
                    '<input type="text" class="decompile-search-input" id="' + uniqueId + '_search" placeholder="🔍 Search types, methods, properties, exports..." oninput="filterDecompileOutline(\'' + uniqueId + '\')">' +
                    '<button class="decompile-kind-btn active" data-kind="all" onclick="filterDecompileByKind(\'' + uniqueId + '\', \'all\')">All</button>' +
                    '<button class="decompile-kind-btn" data-kind="type" onclick="filterDecompileByKind(\'' + uniqueId + '\', \'type\')">Types</button>' +
                    '<button class="decompile-kind-btn" data-kind="method" onclick="filterDecompileByKind(\'' + uniqueId + '\', \'method\')">Methods</button>' +
                    '<button class="decompile-kind-btn" data-kind="property" onclick="filterDecompileByKind(\'' + uniqueId + '\', \'property\')">Props</button>' +
                '</div>' +
                '<div class="decompile-tree-view" id="' + uniqueId + '_tree" style="max-height: ' + (isQuickLook ? '60vh' : '360px') + ';">' + outlineHtml + '</div>' +
            '</div>' +
            // Tab Content 2: Source Code Viewer
            '<div class="decompile-tab-content" id="' + uniqueId + '_code" style="display: none;">' +
                '<pre class="decompile-code-viewer" style="max-height: ' + (isQuickLook ? '60vh' : '380px') + ';"><code id="' + uniqueId + '_code_text">' + escapeHtml(codeSnippet) + '</code></pre>' +
            '</div>' +
            // Tab Content 3: IL / Bytecode Viewer
            '<div class="decompile-tab-content" id="' + uniqueId + '_il" style="display: none;">' +
                '<pre class="decompile-code-viewer" style="max-height: ' + (isQuickLook ? '60vh' : '380px') + ';"><code id="' + uniqueId + '_il_text">' + escapeHtml(ilSnippet) + '</code></pre>' +
            '</div>' +
            // Tab Content 4: Side-by-Side Split View
            '<div class="decompile-tab-content" id="' + uniqueId + '_split" style="display: none;">' +
                '<div class="decompile-split-container">' +
                    '<div class="decompile-split-pane">' +
                        '<div class="decompile-split-header"><span>💻 Source Code (' + escapeHtml(formatLabel) + ')</span><button class="modal-btn" style="font-size: 10px; padding: 2px 6px;" onclick="copyDecompiledCode(\'' + uniqueId + '\')">📋 Copy</button></div>' +
                        '<pre class="decompile-code-viewer decompile-split-pre" id="' + uniqueId + '_split_left_pre" style="max-height: ' + (isQuickLook ? '55vh' : '380px') + ';"><code id="' + uniqueId + '_split_code">' + escapeHtml(codeSnippet) + '</code></pre>' +
                    '</div>' +
                    '<div class="decompile-split-pane">' +
                        '<div class="decompile-split-header"><span>⚡ IL / Bytecode Disassembly</span><button class="modal-btn" style="font-size: 10px; padding: 2px 6px;" onclick="copyDecompiledIL(\'' + uniqueId + '\')">⚡ Copy</button></div>' +
                        '<pre class="decompile-code-viewer decompile-split-pre" id="' + uniqueId + '_split_right_pre" style="max-height: ' + (isQuickLook ? '55vh' : '380px') + ';"><code id="' + uniqueId + '_split_il">' + escapeHtml(ilSnippet) + '</code></pre>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '</div>';

        // Save data in global map for copy actions
        window._decompileDataMap = window._decompileDataMap || new Map();
        window._decompileDataMap.set(uniqueId, data);

    } catch (e) {
        targetElem.innerHTML = renderBinaryFileCard(name, ext, fullPath, '📦', 'Binary File', 'Decompilation failed: ' + (e.message || e));
    }
}

function renderOutlineTree(nodes, uniqueId) {
    let html = '';
    for (const node of nodes) {
        const kind = node.kind || '';
        const kindIcon = kind === 'namespace' ? '📦' :
                         kind === 'class' ? '🔷' :
                         kind === 'interface' ? '🔶' :
                         kind === 'struct' ? '🧱' :
                         kind === 'enum' ? '🔢' :
                         kind === 'method' ? '⚡' :
                         kind === 'property' ? '🔧' :
                         kind === 'field' ? '🏷️' : '📄';

        const hasChildren = node.children && node.children.length > 0;
        const sig = node.signature ? ' <span class="decompile-sig" style="opacity: 0.6; font-size: 10px;">' + escapeHtml(node.signature) + '</span>' : '';

        if (hasChildren) {
            html += '<details open class="decompile-group" data-name="' + escapeHtml(node.name) + '" data-kind="' + escapeHtml(kind) + '" style="margin-left: ' + (kind === 'namespace' ? '0' : '12px') + '; margin-bottom: 2px;">' +
                '<summary class="decompile-tree-item" data-name="' + escapeHtml(node.name) + '" data-kind="' + escapeHtml(kind) + '" style="font-weight: ' + (kind === 'namespace' ? '600' : '500') + ';">' +
                '<span class="decompile-item-icon">' + kindIcon + '</span> <span class="decompile-item-name">' + escapeHtml(node.name) + '</span>' + sig +
                '</summary>' +
                renderOutlineTree(node.children, uniqueId) +
                '</details>';
        } else {
            html += '<div class="decompile-tree-item decompile-leaf" data-name="' + escapeHtml(node.name) + '" data-kind="' + escapeHtml(kind) + '" style="margin-left: 20px; font-size: 10px;" onclick="jumpToDecompiledMember(\'' + uniqueId + '\', \'' + escapeHtml(node.name) + '\')">' +
                '<span class="decompile-item-icon">' + kindIcon + '</span> <span class="decompile-item-name">' + escapeHtml(node.name) + '</span>' + sig +
                '</div>';
        }
    }
    return html;
}

function filterDecompileByKind(uniqueId, kind) {
    const container = document.getElementById(uniqueId + '_outline');
    if (!container) return;
    const buttons = container.querySelectorAll('.decompile-kind-btn');
    buttons.forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-kind') === kind);
    });
    filterDecompileOutline(uniqueId, kind);
}

function filterDecompileOutline(uniqueId, kindOverride) {
    const container = document.getElementById(uniqueId + '_outline');
    if (!container) return;
    const searchInput = document.getElementById(uniqueId + '_search');
    const query = (searchInput ? searchInput.value : '').trim().toLowerCase();

    let activeKind = kindOverride;
    if (!activeKind) {
        const activeBtn = container.querySelector('.decompile-kind-btn.active');
        activeKind = activeBtn ? activeBtn.getAttribute('data-kind') : 'all';
    }

    const treeView = document.getElementById(uniqueId + '_tree');
    if (!treeView) return;

    const allGroups = Array.from(treeView.querySelectorAll('.decompile-group'));
    const allItems = Array.from(treeView.querySelectorAll('.decompile-tree-item'));

    if (!query && activeKind === 'all') {
        allGroups.forEach(g => { g.style.display = ''; });
        allItems.forEach(item => {
            item.style.display = '';
            const nameSpan = item.querySelector('.decompile-item-name');
            const rawName = item.getAttribute('data-name') || '';
            if (nameSpan) nameSpan.textContent = rawName;
        });
        return;
    }

    function matchesKind(itemKind) {
        if (activeKind === 'all') return true;
        if (activeKind === 'type') return ['class', 'interface', 'struct', 'enum'].includes(itemKind);
        if (activeKind === 'method') return itemKind === 'method';
        if (activeKind === 'property') return ['property', 'field'].includes(itemKind);
        return true;
    }

    allItems.forEach(item => {
        const rawName = item.getAttribute('data-name') || '';
        const itemKind = item.getAttribute('data-kind') || '';
        const nameMatches = !query || rawName.toLowerCase().includes(query);
        const kindMatches = matchesKind(itemKind);
        const isMatch = nameMatches && kindMatches;

        const nameSpan = item.querySelector('.decompile-item-name');
        if (nameSpan) {
            if (query && isMatch) {
                const idx = rawName.toLowerCase().indexOf(query);
                if (idx >= 0) {
                    nameSpan.innerHTML = escapeHtml(rawName.substring(0, idx)) +
                        '<mark class="symbol-match">' + escapeHtml(rawName.substring(idx, idx + query.length)) + '</mark>' +
                        escapeHtml(rawName.substring(idx + query.length));
                } else {
                    nameSpan.textContent = rawName;
                }
            } else {
                nameSpan.textContent = rawName;
            }
        }

        if (item.classList.contains('decompile-leaf')) {
            item.style.display = isMatch ? '' : 'none';
        }
    });

    for (let i = allGroups.length - 1; i >= 0; i--) {
        const group = allGroups[i];
        const rawName = group.getAttribute('data-name') || '';
        const itemKind = group.getAttribute('data-kind') || '';
        const selfMatches = (!query || rawName.toLowerCase().includes(query)) && matchesKind(itemKind);

        const hasVisibleChildren = Array.from(group.children).some(child => {
            if (child.tagName.toLowerCase() === 'summary') return false;
            if (child.classList.contains('decompile-group')) return child.style.display !== 'none';
            if (child.classList.contains('decompile-tree-item')) return child.style.display !== 'none';
            return false;
        });

        if (selfMatches || hasVisibleChildren) {
            group.style.display = '';
            group.open = true;
        } else {
            group.style.display = 'none';
        }
    }
}

function switchDecompileTab(uniqueId, tabName) {
    const container = document.getElementById(uniqueId);
    if (!container) return;
    const splitBtn = document.getElementById(uniqueId + '_split_btn');
    if (splitBtn) splitBtn.classList.remove('active');

    const pane = document.getElementById('preview-pane');
    if (pane) pane.classList.remove('split-active');

    const buttons = container.querySelectorAll('.decompile-tab-bar > .decompile-tab-btn:not(.decompile-split-btn)');
    buttons.forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-tab') === tabName);
    });
    const outline = document.getElementById(uniqueId + '_outline');
    const code = document.getElementById(uniqueId + '_code');
    const il = document.getElementById(uniqueId + '_il');
    const split = document.getElementById(uniqueId + '_split');
    if (outline) outline.style.display = tabName === 'outline' ? 'block' : 'none';
    if (code) code.style.display = tabName === 'code' ? 'block' : 'none';
    if (il) il.style.display = tabName === 'il' ? 'block' : 'none';
    if (split) split.style.display = 'none';
}

function toggleDecompileSplitView(uniqueId) {
    const container = document.getElementById(uniqueId);
    if (!container) return;
    const splitBtn = document.getElementById(uniqueId + '_split_btn');
    const outline = document.getElementById(uniqueId + '_outline');
    const code = document.getElementById(uniqueId + '_code');
    const il = document.getElementById(uniqueId + '_il');
    const split = document.getElementById(uniqueId + '_split');
    const pane = document.getElementById('preview-pane');

    const isCurrentlySplit = splitBtn && splitBtn.classList.contains('active');
    if (isCurrentlySplit) {
        if (pane) pane.classList.remove('split-active');
        switchDecompileTab(uniqueId, 'code');
    } else {
        if (pane) pane.classList.add('split-active');
        const tabButtons = container.querySelectorAll('.decompile-tab-bar > .decompile-tab-btn');
        tabButtons.forEach(b => b.classList.remove('active'));
        if (splitBtn) splitBtn.classList.add('active');

        if (outline) outline.style.display = 'none';
        if (code) code.style.display = 'none';
        if (il) il.style.display = 'none';
        if (split) split.style.display = 'block';

        const leftPre = document.getElementById(uniqueId + '_split_left_pre');
        const rightPre = document.getElementById(uniqueId + '_split_right_pre');
        if (leftPre && rightPre && !leftPre._hasSyncScroll) {
            leftPre._hasSyncScroll = true;
            let syncing = false;
            leftPre.addEventListener('scroll', () => {
                if (syncing) return;
                syncing = true;
                const ratio = leftPre.scrollTop / (leftPre.scrollHeight - leftPre.clientHeight || 1);
                rightPre.scrollTop = ratio * (rightPre.scrollHeight - rightPre.clientHeight || 1);
                requestAnimationFrame(() => { syncing = false; });
            });
            rightPre.addEventListener('scroll', () => {
                if (syncing) return;
                syncing = true;
                const ratio = rightPre.scrollTop / (rightPre.scrollHeight - rightPre.clientHeight || 1);
                leftPre.scrollTop = ratio * (leftPre.scrollHeight - leftPre.clientHeight || 1);
                requestAnimationFrame(() => { syncing = false; });
            });
        }
    }
}

function copyDecompiledIL(uniqueId) {
    const data = (window._decompileDataMap && window._decompileDataMap.get(uniqueId));
    if (!data || !data.intermediateLanguageCode) {
        showToast('No IL/bytecode to copy', '⚠️');
        return;
    }
    navigator.clipboard.writeText(data.intermediateLanguageCode);
    showToast('IL / Bytecode copied to clipboard!', '⚡');
}

function showExportProjectModal(uniqueId, fullPath) {
    const data = (window._decompileDataMap && window._decompileDataMap.get(uniqueId));
    const fileName = data ? data.fileName : fullPath.split('/').pop();
    const stem = fileName.replace(/\.[^/.]+$/, '');
    const parentDir = fullPath.substring(0, fullPath.lastIndexOf('/')) || '';
    const defaultDest = parentDir ? parentDir + '/' + stem + '_Decompiled' : stem + '_Decompiled';

    const modalHtml = '<div class="modal-overlay" id="exportProjModal" style="display: flex; align-items: center; justify-content: center; z-index: 10000;">' +
        '<div class="modal-box" style="width: 520px; max-width: 90vw; background: #181825; border: 1px solid #313244; border-radius: 10px; padding: 20px; box-shadow: 0 16px 48px rgba(0,0,0,0.6);">' +
            '<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">' +
                '<h3 style="margin: 0; font-size: 15px; color: #89b4fa; display: flex; align-items: center; gap: 8px;">📦 Reconstruct Project to Disk</h3>' +
                '<button class="modal-btn" style="padding: 2px 8px; font-size: 12px;" onclick="document.getElementById(\'exportProjModal\').remove()">✕</button>' +
            '</div>' +
            '<p style="font-size: 12px; color: var(--text-muted); margin: 0 0 14px 0;">' +
                'Reconstruct a complete, compilable source project from <code>' + escapeHtml(fileName) + '</code>. ' +
                'Source files will be structured into their original package/namespace directories with an active project file (.csproj, pom.xml, or CMakeLists.txt).' +
            '</p>' +
            '<div style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 11px; font-weight: 600; color: #cdd6f4; margin-bottom: 4px;">Destination Directory:</label>' +
                '<input type="text" id="exportDestInput" class="modal-input" value="' + escapeHtml(defaultDest) + '" style="width: 100%; box-sizing: border-box; font-family: monospace; font-size: 12px; padding: 8px; border-radius: 6px; background: #11111b; border: 1px solid #313244; color: #fff;">' +
            '</div>' +
            '<div id="exportStatusArea" style="min-height: 24px; margin-bottom: 14px; font-size: 12px;"></div>' +
            '<div style="display: flex; justify-content: flex-end; gap: 8px;">' +
                '<button class="modal-btn" onclick="document.getElementById(\'exportProjModal\').remove()">Cancel</button>' +
                '<button class="modal-btn" id="exportActionBtn" style="background: #6c5ce7; color: #fff; font-weight: 600;" onclick="executeExportProject(\'' + escapePath(fullPath) + '\')">🚀 Reconstruct Project</button>' +
            '</div>' +
        '</div>' +
    '</div>';

    const existing = document.getElementById('exportProjModal');
    if (existing) existing.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

async function executeExportProject(filePath) {
    const destInput = document.getElementById('exportDestInput');
    const statusArea = document.getElementById('exportStatusArea');
    const actionBtn = document.getElementById('exportActionBtn');
    if (!destInput || !statusArea) return;

    const targetDest = destInput.value.trim();
    if (!targetDest) {
        statusArea.innerHTML = '<span style="color: #f38ba8;">Please specify a destination directory.</span>';
        return;
    }

    statusArea.innerHTML = '<div style="display: flex; align-items: center; gap: 8px; color: #89b4fa;"><div class="spinner" style="width: 14px; height: 14px; border-width: 2px;"></div> Reconstructing source files and project structure...</div>';
    if (actionBtn) actionBtn.disabled = true;

    try {
        const res = await fetch('/api/files/decompile/export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: filePath, destinationDir: targetDest })
        });

        const data = await res.json();
        if (!res.ok || !data.isSuccess) {
            throw new Error(data.errorMessage || 'Export failed with HTTP ' + res.status);
        }

        statusArea.innerHTML = '<div style="background: rgba(166, 227, 161, 0.1); border: 1px solid #a6e3a1; border-radius: 6px; padding: 10px; color: #a6e3a1;">' +
            '<div style="font-weight: 600; margin-bottom: 4px;">🎉 Reconstructed Successfully!</div>' +
            '<div style="font-size: 11px; opacity: 0.9;">' + escapeHtml(data.summary) + '</div>' +
            (data.projectFilePath ? '<div style="font-size: 11px; margin-top: 4px; font-family: monospace;">Project: ' + escapeHtml(data.projectFilePath) + '</div>' : '') +
            '</div>';

        if (actionBtn) {
            actionBtn.textContent = '📂 Open Folder in File Manager';
            actionBtn.disabled = false;
            actionBtn.onclick = () => {
                const modal = document.getElementById('exportProjModal');
                if (modal) modal.remove();
                if (typeof loadDirectory === 'function') {
                    loadDirectory(data.projectDirectory);
                }
            };
        }

        showToast('Reconstructed ' + data.filesWritten + ' files to disk!', '🎉');
    } catch (err) {
        statusArea.innerHTML = '<div style="color: #f38ba8;">Export error: ' + escapeHtml(err.message) + '</div>';
        if (actionBtn) actionBtn.disabled = false;
    }
}

function copyDecompileSummary(uniqueId) {
    const data = (window._decompileDataMap && window._decompileDataMap.get(uniqueId));
    if (!data) return;
    const prompt = `Please provide an executive summary and architectural explanation of this binary:\n` +
        `- File: ${data.fileName}\n` +
        `- Format: ${data.format}\n` +
        `- Target Framework: ${data.targetFramework || 'N/A'}\n` +
        `- Architecture: ${data.architecture || 'N/A'}\n` +
        `- Dependencies: ${(data.dependencies || []).join(', ') || 'None'}\n` +
        `- Deterministic Summary: ${data.deterministicSummary}\n\n` +
        `Outline structure:\n` + JSON.stringify(data.outline || [], null, 2);

    navigator.clipboard.writeText(prompt);
    showToast('AI prompt copied to clipboard! Paste into chat.', '✨');
}

function copyDecompiledCode(uniqueId) {
    const data = (window._decompileDataMap && window._decompileDataMap.get(uniqueId));
    if (!data || !data.decompiledCode) {
        showToast('No code to copy', '⚠️');
        return;
    }
    navigator.clipboard.writeText(data.decompiledCode);
    showToast('Decompiled code copied to clipboard!', '📋');
}

function jumpToDecompiledMember(uniqueId, memberName) {
    switchDecompileTab(uniqueId, 'code');
    const codeElem = document.getElementById(uniqueId + '_code_text');
    if (!codeElem) return;
    const pre = codeElem.parentElement;
    if (!pre) return;
    const text = codeElem.innerText;
    const lines = text.split('\n');
    let targetLineIdx = -1;
    const cleanName = memberName.replace(/\(.*\)/, '').trim();

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes(cleanName) || line.includes(memberName)) {
            targetLineIdx = i;
            break;
        }
    }

    if (targetLineIdx >= 0) {
        const approxLineHeight = 17;
        pre.scrollTop = Math.max(0, (targetLineIdx * approxLineHeight) - 80);
        showToast('Jumped to line ' + (targetLineIdx + 1) + ': ' + cleanName, '⚡');
    } else {
        const idx = text.indexOf(memberName);
        if (idx >= 0) {
            pre.scrollTop = pre.scrollHeight * (idx / text.length);
        }
    }
}

function ensureXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (xlsxLoadingPromise) return xlsxLoadingPromise;
    xlsxLoadingPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
        s.onload = () => resolve(window.XLSX);
        s.onerror = (e) => reject(new Error('Excel viewer engine requires an active internet connection to load initial SheetJS script.'));
        document.head.appendChild(s);
    });
    return xlsxLoadingPromise;
}

function ensureMammoth() {
    if (window.mammoth) return Promise.resolve(window.mammoth);
    if (mammothLoadingPromise) return mammothLoadingPromise;
    mammothLoadingPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js';
        s.onload = () => resolve(window.mammoth);
        s.onerror = (e) => reject(new Error('Word viewer engine requires an active internet connection to load initial Mammoth script.'));
        document.head.appendChild(s);
    });
    return mammothLoadingPromise;
}

function parseCsv(text, delimiter) {
    if (!text) return { headers: [], rows: [], totalRows: 0, delimiter: ',' };
    text = text.replace(/\uFEFF/g, '');
    if (!delimiter) {
        const firstLine = text.split(/\r\n|\n|\r/)[0] || '';
        const commas = (firstLine.match(/,/g) || []).length;
        const tabs = (firstLine.match(/\t/g) || []).length;
        const semicolons = (firstLine.match(/;/g) || []).length;
        if (tabs > commas && tabs > semicolons) delimiter = '\t';
        else if (semicolons > commas && semicolons > tabs) delimiter = ';';
        else delimiter = ',';
    }

    const rows = [];
    let currentRow = [];
    let currentCell = '';
    let insideQuotes = false;
    let i = 0;
    const len = text.length;

    while (i < len) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (char === '"') {
            if (insideQuotes && nextChar === '"') {
                currentCell += '"';
                i += 2;
                continue;
            } else {
                insideQuotes = !insideQuotes;
                i++;
                continue;
            }
        }

        if (!insideQuotes && char === delimiter) {
            currentRow.push(currentCell.trim());
            currentCell = '';
            i++;
            continue;
        }

        if (!insideQuotes && (char === '\r' || char === '\n')) {
            currentRow.push(currentCell.trim());
            currentCell = '';
            if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0] !== '')) {
                rows.push(currentRow);
            }
            currentRow = [];
            if (char === '\r' && nextChar === '\n') i++;
            i++;
            continue;
        }

        currentCell += char;
        i++;
    }

    if (currentCell !== '' || currentRow.length > 0) {
        currentRow.push(currentCell.trim());
        if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0] !== '')) {
            rows.push(currentRow);
        }
    }

    if (rows.length === 0) return { headers: [], rows: [], totalRows: 0, delimiter };
    const headers = rows[0];
    const dataRows = rows.slice(1);
    return { headers, rows: dataRows, totalRows: dataRows.length, delimiter };
}

function renderTableHtml(headers, rows, totalRows, limit = 200) {
    const displayRows = rows.slice(0, limit);
    const maxCols = Math.max(headers ? headers.length : 0, ...rows.map(r => r.length));
    const colHeaders = headers && headers.length > 0 ? [...headers] : [];
    while (colHeaders.length < maxCols) {
        colHeaders.push('Col ' + (colHeaders.length + 1));
    }

    let html = '<div class="preview-table-wrapper"><table class="preview-data-table">';
    html += '<thead><tr><th class="idx-col">#</th>';
    colHeaders.forEach(h => {
        html += '<th>' + escapeHtml(h) + '</th>';
    });
    html += '</tr></thead>';
    html += '<tbody>';
    displayRows.forEach((row, idx) => {
        html += '<tr><td class="idx-col">' + (idx + 1) + '</td>';
        for (let c = 0; c < maxCols; c++) {
            const val = row[c] !== undefined ? String(row[c]) : '';
            html += '<td title="' + escapeHtml(val) + '">' + escapeHtml(val) + '</td>';
        }
        html += '</tr>';
    });
    html += '</tbody></table></div>';
    if (totalRows > limit) {
        html += '<div style="font-size: 11px; color: var(--text-muted); margin-top: 6px; text-align: right;">' +
                'Showing first ' + limit + ' of ' + totalRows.toLocaleString() + ' rows</div>';
    }
    return html;
}

function toggleCsvView(containerId, mode) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const textV = container.querySelector('.csv-text-view');
    const tableV = container.querySelector('.csv-table-view');
    const btns = container.querySelectorAll('.csv-toggle-btn');
    btns.forEach(b => b.classList.toggle('active', b.getAttribute('data-mode') === mode));
    if (mode === 'table') {
        if (textV) textV.style.display = 'none';
        if (tableV) tableV.style.display = 'block';
    } else {
        if (textV) textV.style.display = 'block';
        if (tableV) tableV.style.display = 'none';
    }
}

function switchExcelSheet(containerId, sheetName) {
    const wb = activeWorkbookMap.get(containerId);
    if (!wb) return;
    const sheet = wb.Sheets[sheetName];
    if (!sheet) return;

    const container = document.getElementById(containerId);
    if (!container) return;

    container.querySelectorAll('.sheet-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-sheet') === sheetName);
    });

    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    const tableBox = container.querySelector('.excel-sheet-content');
    if (!tableBox) return;

    if (!data || data.length === 0) {
        tableBox.innerHTML = '<div style="padding: 24px; color: var(--text-muted); text-align: center;">Sheet is empty.</div>';
        return;
    }

    const headers = data[0].map(h => String(h !== undefined ? h : ''));
    const rows = data.slice(1);
    tableBox.innerHTML = renderTableHtml(headers, rows, rows.length, 250);
}

function renderSimpleMarkdown(md) {
    if (!md) return '';
    let html = escapeHtml(md);

    // Code blocks
    html = html.replace(/```([\s\S]*?)```/g, function(match, code) {
        return '<pre><code>' + code.trim() + '</code></pre>';
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Headings
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // Blockquotes
    html = html.replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>');

    // Bold & italic
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Task list items
    html = html.replace(/^- \[x\] (.*$)/gim, '<div style="display:flex;align-items:center;gap:6px;margin:3px 0;"><input type="checkbox" checked disabled> <span>$1</span></div>');
    html = html.replace(/^- \[ \] (.*$)/gim, '<div style="display:flex;align-items:center;gap:6px;margin:3px 0;"><input type="checkbox" disabled> <span>$1</span></div>');

    // Unordered lists
    html = html.replace(/^- (.*$)/gim, '<li>$1</li>');

    // Paragraph breaks
    html = html.replace(/\n\n/g, '<br><br>');

    return html;
}

function toggleMarkdownView(containerId, mode) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const rendered = container.querySelector('.md-rendered-view');
    const raw = container.querySelector('.md-raw-view');
    const btns = container.querySelectorAll('.md-toggle-btn');
    btns.forEach(b => b.classList.toggle('active', b.getAttribute('data-mode') === mode));
    if (mode === 'rendered') {
        if (rendered) rendered.style.display = 'block';
        if (raw) raw.style.display = 'none';
    } else {
        if (rendered) rendered.style.display = 'none';
        if (raw) raw.style.display = 'block';
    }
}

async function renderFilePreview(targetElem, fullPath, name, isDir, isQuickLook = false) {
    if (isDir) {
        targetElem.innerHTML = '<div style="padding: 24px; text-align: center;">' +
            '<i style="font-size: 52px; font-style: normal;">📁</i>' +
            '<div style="font-size: 15px; font-weight: 600; margin-top: 8px;">' + escapeHtml(name) + '</div>' +
            '<div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">Folder • Double-click to navigate</div>' +
            '<div style="margin-top: 12px; display: inline-flex; align-items: center; gap: 6px; background: rgba(108, 92, 231, 0.12); border: 1px solid rgba(162, 155, 254, 0.25); border-radius: 14px; padding: 3px 10px; font-size: 11px; color: #d6d1fd;">' +
            '<span class="ai-sparkle">✨</span> <span id="preview-folder-token-text">Analyzing tokens...</span>' +
            '</div>' +
            '</div>';

        const askAiBtn = document.getElementById('preview-ask-ai-btn');
        if (askAiBtn) askAiBtn.style.display = 'inline-flex';

        fetch('/api/files/ai/context?path=' + encodeURIComponent(fullPath))
            .then(res => res.json())
            .then(data => {
                if (data && data.ok && data.isDirectory) {
                    const tokenText = document.getElementById('preview-folder-token-text');
                    if (tokenText) {
                        tokenText.textContent = `${data.totalCodeFiles || 0} code files • ~${formatTokenCount(data.estimatedTokens)}`;
                    }
                    updatePreviewTokenBadge(data.estimatedTokens, true, fullPath);
                }
            })
            .catch(() => {});
        return;
    }

    const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
    const imgExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp'];
    const sheetExts = ['xlsx', 'xls'];
    const csvExts = ['csv', 'tsv', 'tab'];
    const docExts = ['docx'];
    const pdfExts = ['pdf'];
    const audioExts = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'];
    const videoExts = ['mp4', 'webm', 'mov', 'ogv'];
    const mdExts = ['md', 'markdown'];

    const uniqueId = 'preview-' + Math.random().toString(36).substring(2, 9);
    const sftpInfo = parseSftpUrl(fullPath);
    const cloudInfo = parseCloudUrl(fullPath);
    const rawUrl = sftpInfo
        ? `/api/sftp/download?connectionId=${encodeURIComponent(sftpInfo.connectionId)}&path=${encodeURIComponent(sftpInfo.remotePath)}`
        : (cloudInfo
            ? `/api/cloud/download?connectionId=${encodeURIComponent(cloudInfo.connectionId)}&path=${encodeURIComponent(cloudInfo.remotePath)}`
            : ('/api/files/raw?path=' + encodeURIComponent(fullPath)));
    const readUrl = sftpInfo
        ? `/api/sftp/read?connectionId=${encodeURIComponent(sftpInfo.connectionId)}&path=${encodeURIComponent(sftpInfo.remotePath)}`
        : (cloudInfo
            ? `/api/cloud/read?connectionId=${encodeURIComponent(cloudInfo.connectionId)}&path=${encodeURIComponent(cloudInfo.remotePath)}`
            : ('/api/files/read?path=' + encodeURIComponent(fullPath)));

    // 1. IMAGES
    if (imgExts.includes(ext)) {
        targetElem.innerHTML = '<div style="text-align: center; width: 100%;">' +
            '<img class="preview-image" src="' + rawUrl + '" alt="' + escapeHtml(name) + '" style="max-height: ' + (isQuickLook ? '65vh' : '380px') + '; object-fit: contain;" />' +
            '<div style="font-size: 11px; opacity: 0.7; margin-top: 8px;">' + ext.toUpperCase() + ' Image</div>' +
            '</div>';
        return;
    }

    // 2. CSV / TSV TABLES
    if (csvExts.includes(ext)) {
        targetElem.innerHTML = '<div style="padding: 20px; text-align: center;"><div class="spinner" style="margin: 0 auto 10px;"></div>Loading spreadsheet...</div>';
        try {
            const res = await fetch(readUrl);
            if (!res.ok) throw new Error('File read failed');
            let text = await res.text();
            text = text.replace(/\uFEFF/g, '');
            const { headers, rows, totalRows, delimiter } = parseCsv(text);
            const delimLabel = delimiter === '\t' ? 'Tab-Separated' : (delimiter === ';' ? 'Semicolon' : 'Comma-Separated');
            const defaultMode = 'table';
            const snippet = text.slice(0, isQuickLook ? 15000 : 4000);

            targetElem.innerHTML = '<div id="' + uniqueId + '" style="width: 100%;">' +
                '<div class="preview-badge-bar">' +
                '<span class="preview-badge">📊 ' + ext.toUpperCase() + ' (' + delimLabel + ')</span>' +
                '<div style="display: flex; gap: 4px; align-items: center;">' +
                '<span class="preview-meta-pill" style="margin-right: 6px;">' + totalRows.toLocaleString() + ' rows</span>' +
                '<button class="sheet-tab-btn csv-toggle-btn ' + (defaultMode === 'table' ? 'active' : '') + '" data-mode="table" onclick="toggleCsvView(\'' + uniqueId + '\', \'table\')">📊 Table</button>' +
                '<button class="sheet-tab-btn csv-toggle-btn ' + (defaultMode === 'text' ? 'active' : '') + '" data-mode="text" onclick="toggleCsvView(\'' + uniqueId + '\', \'text\')">📝 Text</button>' +
                '</div>' +
                '</div>' +
                '<div class="csv-text-view" style="' + (defaultMode === 'text' ? '' : 'display: none;') + '">' +
                '<pre style="width: 100%; box-sizing: border-box; background: #131317; padding: 12px; border-radius: 8px; font-family: monospace; font-size: 11px; color: #a29bfe; max-height: ' + (isQuickLook ? '68vh' : '440px') + '; overflow: auto; white-space: pre-wrap;"><code>' + escapeHtml(snippet) + (text.length > snippet.length ? '\n\n... (preview truncated)' : '') + '</code></pre>' +
                '</div>' +
                '<div class="csv-table-view" style="' + (defaultMode === 'table' ? '' : 'display: none;') + '">' +
                renderTableHtml(headers, rows, totalRows, isQuickLook ? 300 : 150) +
                '</div>' +
                '</div>';
        } catch (e) {
            targetElem.innerHTML = renderBinaryFileCard(name, ext, fullPath, '📊', 'CSV Document', 'Could not parse tabular data.');
        }
        return;
    }

    // 3. EXCEL WORKBOOKS (.xlsx, .xls)
    if (sheetExts.includes(ext)) {
        targetElem.innerHTML = '<div style="padding: 24px; text-align: center;"><div class="spinner" style="margin: 0 auto 10px;"></div>Loading Excel Workbook...</div>';
        try {
            const res = await fetch(rawUrl);
            if (!res.ok) throw new Error('Failed to fetch file stream');
            const buffer = await res.arrayBuffer();
            const uint8 = new Uint8Array(buffer.slice(0, 4));
            const isZip = uint8[0] === 0x50 && uint8[1] === 0x4B;
            const isOldXls = uint8[0] === 0xD0 && uint8[1] === 0xCF;

            // Plain text file with .xlsx extension (e.g. manual mock or corrupted text)
            if (!isZip && !isOldXls) {
                const text = new TextDecoder('utf-8').decode(buffer);
                targetElem.innerHTML = '<div class="preview-badge-bar">' +
                    '<span class="preview-badge">📄 Text Content (' + ext.toUpperCase() + ')</span>' +
                    '</div>' +
                    '<pre style="width: 100%; box-sizing: border-box; background: #131317; padding: 12px; border-radius: 8px; font-family: monospace; font-size: 11px; color: #a29bfe; max-height: ' + (isQuickLook ? '66vh' : '420px') + '; overflow: auto; white-space: pre-wrap;"><code>' + escapeHtml(text.slice(0, 8000)) + '</code></pre>';
                return;
            }

            await ensureXlsx();
            const wb = XLSX.read(buffer, { type: 'array' });
            activeWorkbookMap.set(uniqueId, wb);

            let tabsHtml = '<div class="sheet-tabs-container">';
            wb.SheetNames.forEach((sName, idx) => {
                tabsHtml += '<button class="sheet-tab-btn ' + (idx === 0 ? 'active' : '') + '" data-sheet="' + escapeHtml(sName) + '" onclick="switchExcelSheet(\'' + uniqueId + '\', \'' + escapeHtml(sName) + '\')">📑 ' + escapeHtml(sName) + '</button>';
            });
            tabsHtml += '</div>';

            targetElem.innerHTML = '<div id="' + uniqueId + '" style="width: 100%;">' +
                '<div class="preview-badge-bar">' +
                '<span class="preview-badge">📗 Excel Workbook (' + ext.toUpperCase() + ')</span>' +
                '<span class="preview-meta-pill">' + wb.SheetNames.length + ' sheet(s)</span>' +
                '</div>' +
                tabsHtml +
                '<div class="excel-sheet-content"></div>' +
                '</div>';

            if (wb.SheetNames.length > 0) {
                switchExcelSheet(uniqueId, wb.SheetNames[0]);
            }
        } catch (err) {
            targetElem.innerHTML = renderBinaryFileCard(name, ext, fullPath, '📗', 'Excel Spreadsheet', 'Contains binary workbook data. Click below to open in editor.');
        }
        return;
    }

    // 4. WORD DOCUMENTS (.docx)
    if (docExts.includes(ext)) {
        targetElem.innerHTML = '<div style="padding: 24px; text-align: center;"><div class="spinner" style="margin: 0 auto 10px;"></div>Rendering Word document...</div>';
        try {
            const res = await fetch(rawUrl);
            if (!res.ok) throw new Error('Failed to fetch file stream');
            const buffer = await res.arrayBuffer();
            const uint8 = new Uint8Array(buffer.slice(0, 4));
            const isZip = uint8[0] === 0x50 && uint8[1] === 0x4B;

            if (!isZip) {
                const text = new TextDecoder('utf-8').decode(buffer);
                targetElem.innerHTML = '<pre style="width: 100%; box-sizing: border-box; background: #131317; padding: 12px; border-radius: 8px; font-family: monospace; font-size: 11px; color: #a29bfe; max-height: ' + (isQuickLook ? '66vh' : '420px') + '; overflow: auto; white-space: pre-wrap;"><code>' + escapeHtml(text.slice(0, 8000)) + '</code></pre>';
                return;
            }

            await ensureMammoth();
            const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
            targetElem.innerHTML = '<div class="preview-badge-bar">' +
                '<span class="preview-badge">📘 Word Document (.docx)</span>' +
                '<span class="preview-meta-pill">Rich Text View</span>' +
                '</div>' +
                '<div class="doc-paper-view" style="max-height: ' + (isQuickLook ? '68vh' : '480px') + ';">' + (result.value || '<p><em>Empty document</em></p>') + '</div>';
        } catch (err) {
            targetElem.innerHTML = renderBinaryFileCard(name, ext, fullPath, '📘', 'Word Document', 'Contains binary document data. Click below to open in editor.');
        }
        return;
    }

    // 5. PDF DOCUMENTS (.pdf)
    if (pdfExts.includes(ext)) {
        targetElem.innerHTML = '<div style="padding: 24px; text-align: center;"><div class="spinner" style="margin: 0 auto 10px;"></div>Rendering PDF preview...</div>';
        try {
            await ensurePdfJs();
            const loadingTask = window.pdfjsLib.getDocument({ url: rawUrl });
            const pdfDoc = await loadingTask.promise;
            const totalPages = pdfDoc.numPages;

            activePdfMap.set(uniqueId, {
                doc: pdfDoc,
                pageNum: 1,
                totalPages: totalPages,
                scale: 1.0,
                isQuickLook: isQuickLook
            });

            targetElem.innerHTML = '<div id="' + uniqueId + '" style="width: 100%; display: flex; flex-direction: column; gap: 6px;">' +
                '<div class="preview-badge-bar">' +
                '<span class="preview-badge">📕 PDF Document</span>' +
                '<div style="display: flex; gap: 4px; align-items: center;">' +
                '<button class="sheet-tab-btn" onclick="changePdfPage(\'' + uniqueId + '\', -1)" title="Previous Page">◀</button>' +
                '<span class="preview-meta-pill pdf-page-indicator" style="min-width: 55px; text-align: center;">1 / ' + totalPages + '</span>' +
                '<button class="sheet-tab-btn" onclick="changePdfPage(\'' + uniqueId + '\', 1)" title="Next Page">▶</button>' +
                '<button class="sheet-tab-btn" onclick="zoomPdf(\'' + uniqueId + '\', 0.2)" title="Zoom In">🔍+</button>' +
                '<button class="sheet-tab-btn" onclick="zoomPdf(\'' + uniqueId + '\', -0.2)" title="Zoom Out">🔍−</button>' +
                (!isQuickLook ? '<button class="sheet-tab-btn" onclick="toggleQuickLook()" title="Expand in Quick Look (Space)">👁️ Quick Look</button>' : '') +
                '</div>' +
                '</div>' +
                '<div class="pdf-scroll-viewport" style="width: 100%; max-height: ' + (isQuickLook ? '72vh' : '480px') + '; overflow: auto; background: #1a1a22; border-radius: 8px; border: 1px solid var(--border-color); text-align: center; padding: 12px 6px; box-sizing: border-box; box-shadow: inset 0 2px 10px rgba(0,0,0,0.5);">' +
                '<canvas class="pdf-canvas" style="display: inline-block; max-width: 100%; height: auto; box-shadow: 0 4px 18px rgba(0,0,0,0.6); border-radius: 4px; background: #fff;"></canvas>' +
                '</div>' +
                '<div style="display: flex; gap: 6px; justify-content: flex-end; margin-top: 4px;">' +
                '<button class="sheet-tab-btn" onclick="openSelectedItemInEditor(\'' + escapePath(fullPath) + '\')">🚀 Open in Editor</button>' +
                '<button class="sheet-tab-btn" onclick="revealSelectedItemInOS()">📂 Finder</button>' +
                '<a href="' + rawUrl + '" target="_blank" style="color: var(--accent); text-decoration: none; font-size: 11px; display: inline-flex; align-items: center; margin-left: 4px;">↗ Raw</a>' +
                '</div>' +
                '</div>';

            setTimeout(() => {
                renderPdfPage(uniqueId, 1);
            }, 25);
        } catch (pdfErr) {
            console.warn('PDF.js rendering fallback:', pdfErr);
            targetElem.innerHTML = '<div id="' + uniqueId + '" style="width: 100%;">' +
                '<div class="preview-badge-bar">' +
                '<span class="preview-badge">📕 PDF Document</span>' +
                '<div style="display: flex; gap: 6px;">' +
                '<button class="sheet-tab-btn" onclick="openSelectedItemInEditor(\'' + escapePath(fullPath) + '\')">🚀 Open in Editor</button>' +
                '<button class="sheet-tab-btn" onclick="revealSelectedItemInOS()">📂 Finder</button>' +
                '</div>' +
                '</div>' +
                '<object data="' + rawUrl + '#toolbar=0" type="application/pdf" width="100%" height="' + (isQuickLook ? '70vh' : '460px') + '" style="border: 1px solid var(--border-color); border-radius: 6px; background: #222;">' +
                '<iframe src="' + rawUrl + '#toolbar=0" width="100%" height="' + (isQuickLook ? '70vh' : '460px') + '" style="border:none;">' +
                renderBinaryFileCard(name, 'pdf', fullPath, '📕', 'Adobe PDF Document', 'Preview unavailable in this frame.') +
                '</iframe>' +
                '</object>' +
                '</div>';
        }
        return;
    }

    // 6. AUDIO FILES
    if (audioExts.includes(ext)) {
        targetElem.innerHTML = '<div class="media-preview-box">' +
            '<div class="media-icon-badge">🎵</div>' +
            '<div style="font-size: 14px; font-weight: 600;">' + escapeHtml(name) + '</div>' +
            '<div class="preview-meta-pill" style="margin-top: 4px;">Audio Track • ' + ext.toUpperCase() + '</div>' +
            '<audio controls autoplay src="' + rawUrl + '"></audio>' +
            '</div>';
        return;
    }

    // 7. VIDEO FILES
    if (videoExts.includes(ext)) {
        targetElem.innerHTML = '<div class="media-preview-box" style="padding: 10px;">' +
            '<video controls autoplay muted playsinline src="' + rawUrl + '" style="max-height: ' + (isQuickLook ? '65vh' : '400px') + ';"></video>' +
            '<div class="preview-meta-pill" style="margin-top: 8px;">Video Clip • ' + ext.toUpperCase() + '</div>' +
            '</div>';
        return;
    }

    // 8. MARKDOWN FILES (.md, .markdown)
    if (mdExts.includes(ext)) {
        targetElem.innerHTML = '<div style="padding: 16px; text-align: center;"><div class="spinner" style="margin: 0 auto 10px;"></div>Loading Markdown...</div>';
        try {
            const res = await fetch(readUrl);
            if (!res.ok) throw new Error('File read failed');
            const text = await res.text();
            const renderedHtml = renderSimpleMarkdown(text);
            const snippet = text.slice(0, 15000);
            const tokens = estimateTokens(text);
            updatePreviewTokenBadge(tokens, false, fullPath);

            targetElem.innerHTML = '<div id="' + uniqueId + '" style="width: 100%;">' +
                '<div class="preview-badge-bar">' +
                '<span class="preview-badge">📝 Markdown</span>' +
                '<div style="display: flex; gap: 4px; align-items: center;">' +
                '<span class="preview-meta-pill" style="margin-right: 4px;">✨ ~' + formatTokenCount(tokens) + '</span>' +
                '<button class="sheet-tab-btn md-toggle-btn active" data-mode="rendered" onclick="toggleMarkdownView(\'' + uniqueId + '\', \'rendered\')">👁️ Rendered</button>' +
                '<button class="sheet-tab-btn md-toggle-btn" data-mode="raw" onclick="toggleMarkdownView(\'' + uniqueId + '\', \'raw\')">📝 Raw</button>' +
                '</div>' +
                '</div>' +
                '<div class="md-rendered-view" style="max-height: ' + (isQuickLook ? '68vh' : '460px') + ';">' + renderedHtml + '</div>' +
                '<div class="md-raw-view" style="display: none;"><pre style="background: #131317; padding: 12px; border-radius: 8px; font-family: monospace; font-size: 11px; color: #a29bfe; max-height: ' + (isQuickLook ? '68vh' : '460px') + '; overflow: auto; white-space: pre-wrap;"><code>' + escapeHtml(snippet) + (text.length > 15000 ? '\n\n... (preview truncated)' : '') + '</code></pre></div>' +
                '</div>';
        } catch (e) {
            updatePreviewTokenBadge(0, false, null);
            targetElem.innerHTML = '<div style="padding: 20px; color: var(--danger);">Could not read markdown.</div>';
        }
        return;
    }

    // 8b. DECOMPILABLE BINARIES (.dll, .exe, .class, .jar, .war)
    const decompileExts = ['dll', 'exe', 'class', 'jar', 'war'];
    if (decompileExts.includes(ext)) {
        updatePreviewTokenBadge(0, false, null);
        renderDecompilerCard(name, ext, fullPath, isQuickLook, targetElem);
        return;
    }

    // 9. KNOWN BINARY FILES
    if (knownBinaryExts.includes(ext)) {
        updatePreviewTokenBadge(0, false, null);
        targetElem.innerHTML = renderBinaryFileCard(name, ext, fullPath, '📦', ext.toUpperCase() + ' Binary File', 'This is a binary file and cannot be previewed as text.');
        return;
    }

    // 10. CODE & TEXT FALLBACK
    targetElem.innerHTML = '<div style="padding: 16px; opacity: 0.6;">Loading preview...</div>';
    try {
        const res = await fetch(readUrl);
        if (res.ok) {
            const text = await res.text();
            // Catch-all: check if text contains null bytes or binary control characters
            if (text.includes('\0') || /[\x00-\x08\x0E-\x1F]/.test(text.slice(0, 512))) {
                updatePreviewTokenBadge(0, false, null);
                targetElem.innerHTML = renderBinaryFileCard(name, ext, fullPath, '📦', 'Binary File', 'File contains binary data and cannot be displayed as plain text.');
                return;
            }
            const lineCount = (text.match(/\n/g) || []).length + 1;
            const charCount = text.length;
            const snippet = text.slice(0, isQuickLook ? 12000 : 4000);
            const tokens = estimateTokens(text);
            updatePreviewTokenBadge(tokens, false, fullPath);

            targetElem.innerHTML = '<div class="preview-badge-bar">' +
                '<span class="preview-badge">📄 ' + (ext ? ext.toUpperCase() : 'TEXT') + ' File</span>' +
                '<span class="preview-meta-pill">' + lineCount.toLocaleString() + ' lines • ✨ ~' + formatTokenCount(tokens) + '</span>' +
                '</div>' +
                '<pre style="width: 100%; box-sizing: border-box; background: #131317; padding: 12px; border-radius: 8px; font-family: monospace; font-size: 11px; color: #a29bfe; max-height: ' + (isQuickLook ? '66vh' : '420px') + '; overflow: auto; white-space: pre-wrap;"><code>' + escapeHtml(snippet) + (text.length > snippet.length ? '\n\n... (preview truncated)' : '') + '</code></pre>';
        } else {
            updatePreviewTokenBadge(0, false, null);
            targetElem.innerHTML = renderBinaryFileCard(name, ext, fullPath, '📦', 'Binary or Unreadable File');
        }
    } catch (e) {
        updatePreviewTokenBadge(0, false, null);
        targetElem.innerHTML = renderBinaryFileCard(name, ext, fullPath, '📦', 'Binary or Unreadable File');
    }
}

async function handlePreview(name, isDir) {
    const previewPane = document.getElementById('preview-pane');
    if (previewPane) {
        previewPane.classList.remove('split-active');
        if (previewPane.classList.contains('collapsed')) return;
    }

    const previewContent = document.getElementById('preview-content');
    document.querySelector('#preview-pane h2').innerText = name;

    const sep = isWindows ? '\\' : '/';
    const fullPath = (selectedItem && selectedItem.path) ? selectedItem.path : (currentPath.endsWith(sep) ? currentPath + name : currentPath + sep + name);
    activePreviewPath = fullPath;
    activePreviewIsDir = isDir;
    updatePreviewActionButtons(fullPath, isDir);

    await renderFilePreview(previewContent, fullPath, name, isDir, false);
}

// ══════════════════════════════════════════════════════════
// 👁️ MAC QUICK LOOK (SPACEBAR)
// ══════════════════════════════════════════════════════════
async function toggleQuickLook() {
    const modal = document.getElementById('modal-quick-look');
    if (modal.style.display === 'flex') {
        closeQuickLook();
        return;
    }
    if (!selectedItem) {
        showToast('Select a file to Quick Look', '👁️');
        return;
    }

    const sep = isWindows ? '\\' : '/';
    const fullPath = (selectedItem && selectedItem.path) ? selectedItem.path : (currentPath.endsWith(sep) ? currentPath + selectedItem.name : currentPath + sep + selectedItem.name);
    const qlTitle = document.getElementById('ql-title');
    const qlBody = document.getElementById('ql-body');

    qlTitle.innerText = selectedItem.name;
    qlBody.innerHTML = '<div style="padding: 30px; text-align: center;"><div class="spinner" style="margin: 0 auto 10px;"></div>Loading Quick Look...</div>';
    modal.style.display = 'flex';

    const isDir = selectedItem.type === 'Directory';
    const qlEditBtn = document.getElementById('ql-edit-btn');
    const qlSaveBtn = document.getElementById('ql-save-btn');
    if (qlEditBtn) {
        qlEditBtn.style.display = (!isDir && isEditableTextFile(fullPath)) ? 'inline-flex' : 'none';
        qlEditBtn.textContent = '✏️ Edit';
    }
    if (qlSaveBtn) qlSaveBtn.style.display = 'none';
    isQlEditorActive = false;

    await renderFilePreview(qlBody, fullPath, selectedItem.name, isDir, true);
}

function closeQuickLook() {
    document.getElementById('modal-quick-look').style.display = 'none';
    isQlEditorActive = false;
}


// 📝 IN-LINE QUICK CODE / TEXT EDITOR
// ══════════════════════════════════════════════════════════
let isInlineEditorActive = false;
let isQlEditorActive = false;
let inlineOriginalContent = '';
let qlOriginalContent = '';

function isEditableTextFile(path) {
    if (!path) return false;
    const lower = path.toLowerCase();
    const exts = [
        '.txt', '.md', '.markdown', '.json', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
        '.css', '.scss', '.sass', '.less', '.html', '.htm', '.xml', '.svg',
        '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.env', '.gitignore',
        '.sh', '.bash', '.zsh', '.bat', '.cmd', '.ps1',
        '.py', '.cs', '.java', '.cpp', '.c', '.h', '.hpp', '.rs', '.go', '.php', '.rb',
        '.sql', '.log', '.csv', '.tsv', '.lock', '.properties'
    ];
    const dotIdx = lower.lastIndexOf('.');
    if (dotIdx === -1) return true;
    const ext = lower.substring(dotIdx);
    return exts.includes(ext) || lower.endsWith('dockerfile') || lower.endsWith('makefile') || lower.endsWith('license');
}

async function toggleInlineEditor() {
    if (!activePreviewPath || activePreviewIsDir) return;
    if (isInlineEditorActive) {
        cancelInlineEditor();
        return;
    }
    const container = document.getElementById('preview-content');
    if (!container) return;

    try {
        container.innerHTML = '<div style="padding: 30px; text-align: center;"><div class="spinner" style="margin: 0 auto 10px;"></div>Opening in-line editor...</div>';
        let text = '';
        const sftpInfo = parseSftpUrl(activePreviewPath);
        const cloudInfo = parseCloudUrl(activePreviewPath);
        if (sftpInfo) {
            let res = await fetch(`/api/sftp/read?connectionId=${encodeURIComponent(sftpInfo.connectionId)}&path=${encodeURIComponent(sftpInfo.remotePath)}`).catch(() => null);
            if (!res || !res.ok) {
                showToast('Unable to open remote file for editing', '⚠️');
                handlePreview(selectedItem ? selectedItem.name : activePreviewPath, false);
                return;
            }
            text = await res.text();
        } else if (cloudInfo) {
            let res = await fetch(`/api/cloud/read?connectionId=${encodeURIComponent(cloudInfo.connectionId)}&path=${encodeURIComponent(cloudInfo.remotePath)}`).catch(() => null);
            if (!res || !res.ok) {
                showToast('Unable to open cloud file for editing', '⚠️');
                handlePreview(selectedItem ? selectedItem.name : activePreviewPath, false);
                return;
            }
            text = await res.text();
        } else {
            let res = await fetch('/api/files/download?path=' + encodeURIComponent(activePreviewPath)).catch(function() { return null; });
            if (!res || !res.ok) res = await fetch('/api/files/read?path=' + encodeURIComponent(activePreviewPath)).catch(function() { return null; });
            if (!res || !res.ok) res = await fetch('/api/files/raw?path=' + encodeURIComponent(activePreviewPath)).catch(function() { return null; });
            if (!res || !res.ok) {
                showToast('Unable to open file for editing', '⚠️');
                handlePreview(selectedItem ? selectedItem.name : activePreviewPath, false);
                return;
            }
            text = await res.text();
        }
        inlineOriginalContent = text;
        isInlineEditorActive = true;

        const lines = text.split('\n').length;
        const chars = text.length;
        const estimatedTokens = Math.ceil(chars / 4);

        container.innerHTML = 
            '<div class="inline-editor-container">' +
                '<div class="inline-editor-toolbar">' +
                    '<div class="inline-editor-stats">' +
                        '<span id="inline-editor-lines">' + lines + ' lines</span>' +
                        '<span>•</span>' +
                        '<span id="inline-editor-chars">' + chars + ' chars</span>' +
                        '<span>•</span>' +
                        '<span id="inline-editor-tokens" class="token-pill">✨ ~' + estimatedTokens.toLocaleString() + ' tokens</span>' +
                    '</div>' +
                    '<div style="display: flex; gap: 6px;">' +
                        '<button class="preview-action-btn preview-save-btn" onclick="saveInlineEditor()" title="Save changes (⌘S / Ctrl+S)">💾 Save</button>' +
                        '<button class="preview-action-btn preview-cancel-btn" onclick="cancelInlineEditor()" title="Cancel editing (Esc)">✕ Cancel</button>' +
                    '</div>' +
                '</div>' +
                '<textarea id="inline-editor-textarea" class="inline-editor-textarea" spellcheck="false" placeholder="Enter file content..."></textarea>' +
            '</div>';

        const textarea = document.getElementById('inline-editor-textarea');
        if (textarea) {
            textarea.value = text;
            textarea.addEventListener('input', function() {
                const val = textarea.value;
                const lineCount = val.split('\n').length;
                const charCount = val.length;
                const tokenCount = Math.ceil(charCount / 4);
                const linesEl = document.getElementById('inline-editor-lines');
                const charsEl = document.getElementById('inline-editor-chars');
                const tokensEl = document.getElementById('inline-editor-tokens');
                if (linesEl) linesEl.textContent = lineCount + ' lines';
                if (charsEl) charsEl.textContent = charCount + ' chars';
                if (tokensEl) tokensEl.textContent = '✨ ~' + tokenCount.toLocaleString() + ' tokens';
            });
            textarea.focus();
        }
        updatePreviewActionButtons(activePreviewPath, false);
    } catch (err) {
        console.error(err);
        showToast('Failed to load file for editing', '❌');
        isInlineEditorActive = false;
        if (selectedItem) handlePreview(selectedItem.name, false);
    }
}

async function saveInlineEditor() {
    if (!activePreviewPath) return;
    const textarea = document.getElementById('inline-editor-textarea');
    if (!textarea) return;
    const newContent = textarea.value;
    const sep = isWindows ? '\\' : '/';
    const fileName = activePreviewPath.split(sep).pop() || activePreviewPath;

    const sftpInfo = parseSftpUrl(activePreviewPath);
    const cloudInfo = parseCloudUrl(activePreviewPath);
    if (sftpInfo) {
        try {
            const payload = JSON.stringify({
                connectionId: sftpInfo.connectionId,
                remotePath: sftpInfo.remotePath,
                content: newContent
            });
            const res = await fetch('/api/sftp/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: payload
            });
            if (res.ok) {
                const lines = newContent.split('\n').length;
                showToast('Saved "' + fileName + '" to SFTP (' + lines + ' lines) 💾', '✅');
                isInlineEditorActive = false;
                inlineOriginalContent = newContent;
                if (selectedItem) {
                    handlePreview(selectedItem.name, false);
                } else {
                    renderFilePreview(document.getElementById('preview-content'), activePreviewPath, fileName, false, false);
                }
                updatePreviewActionButtons(activePreviewPath, false);
            } else {
                showToast('Failed to save file to SFTP', '❌');
            }
        } catch (err) {
            console.error(err);
            showToast('Error saving file: ' + err.message, '❌');
        }
        return;
    } else if (cloudInfo) {
        try {
            const payload = JSON.stringify({
                connectionId: cloudInfo.connectionId,
                remotePath: cloudInfo.remotePath,
                content: newContent
            });
            const res = await fetch('/api/cloud/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: payload
            });
            if (res.ok) {
                const lines = newContent.split('\n').length;
                showToast('Saved "' + fileName + '" to Cloud Storage (' + lines + ' lines) 💾', '✅');
                isInlineEditorActive = false;
                inlineOriginalContent = newContent;
                if (selectedItem) {
                    handlePreview(selectedItem.name, false);
                } else {
                    renderFilePreview(document.getElementById('preview-content'), activePreviewPath, fileName, false, false);
                }
                updatePreviewActionButtons(activePreviewPath, false);
            } else {
                showToast('Failed to save file to Cloud Storage', '❌');
            }
        } catch (err) {
            console.error(err);
            showToast('Error saving file: ' + err.message, '❌');
        }
        return;
    }

    try {
        const payload = JSON.stringify({ path: activePreviewPath, content: newContent });
        const res = await fetch('/api/files/saveFile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload
        });

        if (typeof window.vscode !== 'undefined' && window.vscode.postMessage) {
            window.vscode.postMessage({ command: 'saveFile', path: activePreviewPath, content: newContent });
        }
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ command: 'saveFile', path: activePreviewPath, content: newContent }, '*');
        }

        if (res.ok) {
            const lines = newContent.split('\n').length;
            showToast('Saved "' + fileName + '" (' + lines + ' lines) 💾', '✅');
            isInlineEditorActive = false;
            inlineOriginalContent = newContent;
            fetchGitStatus(currentPath);
            if (selectedItem) {
                handlePreview(selectedItem.name, false);
            } else {
                renderFilePreview(document.getElementById('preview-content'), activePreviewPath, fileName, false, false);
            }
            updatePreviewActionButtons(activePreviewPath, false);
        } else {
            showToast('Failed to save file', '❌');
        }
    } catch (err) {
        console.error(err);
        showToast('Error saving file: ' + err.message, '❌');
    }
}

function cancelInlineEditor() {
    isInlineEditorActive = false;
    updatePreviewActionButtons(activePreviewPath, false);
    const sep = isWindows ? '\\' : '/';
    const fileName = activePreviewPath ? (activePreviewPath.split(sep).pop() || activePreviewPath) : '';
    if (selectedItem) {
        handlePreview(selectedItem.name, false);
    } else if (activePreviewPath) {
        renderFilePreview(document.getElementById('preview-content'), activePreviewPath, fileName, false, false);
    }
}

async function toggleQuickLookEditor() {
    if (!selectedItem || selectedItem.type === 'Directory') return;
    const qlBody = document.getElementById('ql-body');
    const qlEditBtn = document.getElementById('ql-edit-btn');
    const qlSaveBtn = document.getElementById('ql-save-btn');
    if (!qlBody) return;

    const sep = isWindows ? '\\' : '/';
    const sftpInfo = parseSftpUrl(currentPath);
    let fullPath;
    if (sftpInfo) {
        fullPath = `sftp://${sftpInfo.connectionId}${sftpInfo.remotePath === '/' ? '/' + selectedItem.name : sftpInfo.remotePath + '/' + selectedItem.name}`;
    } else {
        fullPath = (selectedItem && selectedItem.path) ? selectedItem.path : (currentPath.endsWith(sep) ? currentPath + selectedItem.name : currentPath + sep + selectedItem.name);
    }

    if (isQlEditorActive) {
        isQlEditorActive = false;
        if (qlEditBtn) qlEditBtn.textContent = '✏️ Edit';
        if (qlSaveBtn) qlSaveBtn.style.display = 'none';
        renderFilePreview(qlBody, fullPath, selectedItem.name, false, true);
        return;
    }

    try {
        qlBody.innerHTML = '<div style="padding: 30px; text-align: center;"><div class="spinner" style="margin: 0 auto 10px;"></div>Loading editor...</div>';
        let text = '';
        const fileSftp = parseSftpUrl(fullPath);
        if (fileSftp) {
            let res = await fetch(`/api/sftp/read?connectionId=${encodeURIComponent(fileSftp.connectionId)}&path=${encodeURIComponent(fileSftp.remotePath)}`).catch(() => null);
            if (!res || !res.ok) {
                showToast('Unable to open remote file for editing', '⚠️');
                renderFilePreview(qlBody, fullPath, selectedItem.name, false, true);
                return;
            }
            text = await res.text();
        } else {
            let res = await fetch('/api/files/download?path=' + encodeURIComponent(fullPath)).catch(function() { return null; });
            if (!res || !res.ok) res = await fetch('/api/files/read?path=' + encodeURIComponent(fullPath)).catch(function() { return null; });
            if (!res || !res.ok) res = await fetch('/api/files/raw?path=' + encodeURIComponent(fullPath)).catch(function() { return null; });
            if (!res || !res.ok) {
                showToast('Unable to open file for editing', '⚠️');
                renderFilePreview(qlBody, fullPath, selectedItem.name, false, true);
                return;
            }
            text = await res.text();
        }
        qlOriginalContent = text;
        isQlEditorActive = true;
        if (qlEditBtn) qlEditBtn.textContent = '✕ Discard';
        if (qlSaveBtn) qlSaveBtn.style.display = 'inline-flex';

        qlBody.innerHTML = 
            '<div class="inline-editor-container" style="height: 100%;">' +
                '<textarea id="ql-editor-textarea" class="inline-editor-textarea" style="height: calc(100% - 10px); min-height: 380px;" spellcheck="false"></textarea>' +
            '</div>';

        const textarea = document.getElementById('ql-editor-textarea');
        if (textarea) {
            textarea.value = text;
            textarea.focus();
        }
    } catch (err) {
        console.error(err);
        showToast('Failed to load file for editing', '❌');
        isQlEditorActive = false;
        renderFilePreview(qlBody, fullPath, selectedItem.name, false, true);
    }
}

async function saveQuickLookEditor() {
    if (!selectedItem) return;
    const textarea = document.getElementById('ql-editor-textarea');
    if (!textarea) return;
    const newContent = textarea.value;
    const sep = isWindows ? '\\' : '/';
    const sftpInfo = parseSftpUrl(currentPath);
    let fullPath;
    if (sftpInfo) {
        fullPath = `sftp://${sftpInfo.connectionId}${sftpInfo.remotePath === '/' ? '/' + selectedItem.name : sftpInfo.remotePath + '/' + selectedItem.name}`;
    } else {
        fullPath = (selectedItem && selectedItem.path) ? selectedItem.path : (currentPath.endsWith(sep) ? currentPath + selectedItem.name : currentPath + sep + selectedItem.name);
    }

    const fileSftp = parseSftpUrl(fullPath);
    if (fileSftp) {
        try {
            const payload = JSON.stringify({
                connectionId: fileSftp.connectionId,
                remotePath: fileSftp.remotePath,
                content: newContent
            });
            const res = await fetch('/api/sftp/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: payload
            });
            if (res.ok) {
                const lines = newContent.split('\n').length;
                showToast('Saved "' + selectedItem.name + '" to SFTP (' + lines + ' lines) 💾', '✅');
                isQlEditorActive = false;
                const qlEditBtn = document.getElementById('ql-edit-btn');
                const qlSaveBtn = document.getElementById('ql-save-btn');
                if (qlEditBtn) qlEditBtn.textContent = '✏️ Edit';
                if (qlSaveBtn) qlSaveBtn.style.display = 'none';
                renderFilePreview(document.getElementById('ql-body'), fullPath, selectedItem.name, false, true);
            } else {
                showToast('Failed to save file to SFTP', '❌');
            }
        } catch (err) {
            console.error(err);
            showToast('Error saving: ' + err.message, '❌');
        }
        return;
    }

    try {
        const payload = JSON.stringify({ path: fullPath, content: newContent });
        const res = await fetch('/api/files/saveFile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload
        });
        if (typeof window.vscode !== 'undefined' && window.vscode.postMessage) {
            window.vscode.postMessage({ command: 'saveFile', path: fullPath, content: newContent });
        }
        if (res.ok) {
            const lines = newContent.split('\n').length;
            showToast('Saved "' + selectedItem.name + '" (' + lines + ' lines) 💾', '✅');
            isQlEditorActive = false;
            fetchGitStatus(currentPath);
            const qlEditBtn = document.getElementById('ql-edit-btn');
            const qlSaveBtn = document.getElementById('ql-save-btn');
            if (qlEditBtn) qlEditBtn.textContent = '✏️ Edit';
            if (qlSaveBtn) qlSaveBtn.style.display = 'none';
            renderFilePreview(document.getElementById('ql-body'), fullPath, selectedItem.name, false, true);
        } else {
            showToast('Failed to save file', '❌');
        }
    } catch (err) {
        console.error(err);
        showToast('Error saving: ' + err.message, '❌');
    }
}

// ══════════════════════════════════════════════════════════