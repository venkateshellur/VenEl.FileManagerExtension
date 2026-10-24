/**
 * VenEl File Manager - File Operations & Modals
 * CRUD (New, Rename, Delete), Batch Rename, Diff Viewer, and Archive utilities.
 */
// ══════════════════════════════════════════════════════════
// ℹ️ PROPERTIES / GET INFO
// ══════════════════════════════════════════════════════════
async function showPropertiesModal() {
    hideContextMenu();
    if (!selectedItem) return;
    const sep = isWindows ? '\\' : '/';
    const fullPath = currentPath.endsWith(sep) ? currentPath + selectedItem.name : currentPath + sep + selectedItem.name;
    selectedPropPath = fullPath;

    try {
        const res = await fetch('/api/files/details?path=' + encodeURIComponent(fullPath));
        if (!res.ok) throw new Error();
        const d = await res.json();

        const visual = getFileVisual(d.name, d.isDirectory);
        const propIconEl = document.getElementById('prop-icon');
        if (propIconEl) {
            if (visual.svg) propIconEl.innerHTML = visual.svg;
            else propIconEl.innerText = visual.icon;
        }
        document.getElementById('prop-title').innerText = d.name;
        document.getElementById('prop-path').innerText = d.path;
        document.getElementById('prop-type').innerText = visual.typeLabel;
        document.getElementById('prop-size').innerText = !d.isDirectory ? (formatBytes(d.size) + ' (' + d.size.toLocaleString() + ' bytes)') : '--';

        const containsLabel = document.getElementById('prop-contains-label');
        const containsVal = document.getElementById('prop-contains');
        if (d.isDirectory && typeof d.itemCount !== 'undefined') {
            containsLabel.style.display = 'block';
            containsVal.style.display = 'block';
            containsVal.innerText = d.itemCount + ' items';
        } else {
            containsLabel.style.display = 'none';
            containsVal.style.display = 'none';
        }

        document.getElementById('prop-modified').innerText = formatDate(d.modified);
        document.getElementById('modal-properties').style.display = 'flex';
    } catch {
        showToast('Failed to load item properties', '❌');
    }
}

function copyPathToClipboard(pathStr) {
    if (!pathStr) return;
    navigator.clipboard.writeText(pathStr);
    showToast('Full path copied to clipboard!', '📋');
}


// ══════════════════════════════════════════════════════════
// 💻 OPEN IN TERMINAL & EDITOR
// ══════════════════════════════════════════════════════════
function isScriptFile(filename) {
    if (!filename) return false;
    const dot = filename.lastIndexOf('.');
    if (dot === -1) return false;
    const ext = filename.substring(dot).toLowerCase();
    return ['.bat', '.cmd', '.sh', '.command', '.bash', '.zsh', '.ps1'].includes(ext);
}

function isSystemDocOrMediaFile(filename) {
    if (!filename) return false;
    const dot = filename.lastIndexOf('.');
    if (dot === -1) return false;
    const ext = filename.substring(dot).toLowerCase();
    return [
        '.xlsx', '.xls', '.xlsm', '.docx', '.doc', '.pptx', '.ppt',
        '.pdf', '.numbers', '.pages', '.keynote',
        '.mp4', '.mov', '.avi', '.mkv', '.mp3', '.wav', '.flac', '.aac',
        '.psd', '.ai', '.epub', '.exe', '.msi', '.dmg', '.pkg', '.app'
    ].includes(ext);
}

function getSystemAppFriendlyLabel(filename) {
    if (!filename) return 'Open with System Default App';
    const dot = filename.lastIndexOf('.');
    if (dot === -1) return 'Open with System Default App';
    const ext = filename.substring(dot).toLowerCase();
    if (ext === '.xlsx' || ext === '.xls' || ext === '.xlsm') return 'Open in Excel / Default App';
    if (ext === '.docx' || ext === '.doc') return 'Open in Word / Default App';
    if (ext === '.pptx' || ext === '.ppt') return 'Open in PowerPoint / Default App';
    if (ext === '.pdf') return 'Open in PDF Reader / Default App';
    if (['.mp4', '.mov', '.avi', '.mkv'].includes(ext)) return 'Play in Media Player';
    if (['.mp3', '.wav', '.flac', '.aac'].includes(ext)) return 'Play Audio';
    return 'Open with System Default App';
}

function smartOpenFile(targetPath) {
    hideContextMenu();
    const sep = isWindows ? '\\' : '/';
    const path = targetPath || (selectedItem ? (selectedItem.path || (currentPath.endsWith(sep) ? currentPath + selectedItem.name : currentPath + sep + selectedItem.name)) : null);
    if (!path) return;

    const fileName = path.substring(path.lastIndexOf(sep) + 1);
    if (isScriptFile(fileName)) {
        runScriptInTerminal(path);
    } else if (isSystemDocOrMediaFile(fileName)) {
        openFileWithSystemApp(path);
    } else {
        openSelectedItemInEditor(path);
    }
}

function openSelectedFileInEditor() {
    openSelectedItemInEditor();
}

function openSelectedItemInEditor(targetPath) {
    hideContextMenu();
    const sep = isWindows ? '\\' : '/';
    const path = targetPath || (selectedItem ? (selectedItem.path || (currentPath.endsWith(sep) ? currentPath + selectedItem.name : currentPath + sep + selectedItem.name)) : null);
    if (path) {
        const fileName = path.substring(path.lastIndexOf(sep) + 1);
        showToast('Opening ' + fileName + ' in ' + detectedIdeName + '...', '🚀');
        if (window.vscode) {
            window.vscode.postMessage({ command: 'openInEditor', path: path });
        } else if (window.parent && window.parent !== window) {
            window.parent.postMessage({ command: 'openInEditor', path: path }, '*');
        }
        fetch('/api/files/openInEditor?path=' + encodeURIComponent(path)).catch(() => {});
    }
}

function openSelectedWithSystemApp(targetPath) {
    hideContextMenu();
    const sep = isWindows ? '\\' : '/';
    const p = targetPath || (selectedItem ? (selectedItem.path || (currentPath.endsWith(sep) ? currentPath + selectedItem.name : currentPath + sep + selectedItem.name)) : currentPath);
    if (!p) return;
    openFileWithSystemApp(p);
}

function openFileWithSystemApp(filePath) {
    if (!filePath) return;
    const sep = isWindows ? '\\' : '/';
    const fileName = filePath.substring(filePath.lastIndexOf(sep) + 1);
    showToast('Opening ' + fileName + ' with System App...', '↗️');

    // 1. VS Code Webview IPC
    if (window.vscode) {
        window.vscode.postMessage({ command: 'openWithSystemApp', path: filePath });
    } else if (window.parent && window.parent !== window) {
        window.parent.postMessage({ command: 'openWithSystemApp', path: filePath }, '*');
    }

    // 2. HTTP Server backend
    fetch('/api/files/openWithSystem?path=' + encodeURIComponent(filePath), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath })
    }).catch(() => fetch('/api/files/openWithSystem?path=' + encodeURIComponent(filePath)));
}

function runSelectedScriptInTerminal(targetPath) {
    hideContextMenu();
    const sep = isWindows ? '\\' : '/';
    const p = targetPath || (selectedItem ? (selectedItem.path || (currentPath.endsWith(sep) ? currentPath + selectedItem.name : currentPath + sep + selectedItem.name)) : null);
    if (!p) return;
    runScriptInTerminal(p);
}

function runScriptInTerminal(filePath) {
    if (!filePath) return;
    const sep = isWindows ? '\\' : '/';
    const fileName = filePath.substring(filePath.lastIndexOf(sep) + 1);
    showToast('Running ' + fileName + ' in Terminal...', '⚡');

    // 1. VS Code Webview IPC
    if (window.vscode) {
        window.vscode.postMessage({ command: 'runInTerminal', path: filePath });
    } else if (window.parent && window.parent !== window) {
        window.parent.postMessage({ command: 'runInTerminal', path: filePath }, '*');
    }

    // 2. HTTP Server backend
    fetch('/api/files/runScript?path=' + encodeURIComponent(filePath), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath })
    }).catch(() => fetch('/api/files/runScript?path=' + encodeURIComponent(filePath)));
}

function openTerminal(targetPath) {
    hideContextMenu();
    const sep = isWindows ? '\\' : '/';
    let p = targetPath || activeWorkingDirectory || currentPath;
    // If target is a file or selected item is a file, use its parent folder
    if (selectedItem && selectedItem.type !== 'Directory' && p.endsWith(sep + selectedItem.name)) {
        p = currentPath;
    } else {
        const lastSep = p.lastIndexOf(sep);
        const lastDot = p.lastIndexOf('.');
        if (lastDot > lastSep && lastSep > 0) {
            p = p.substring(0, lastSep);
        }
    }

    // 1. VS Code Webview IPC
    if (window.parent && window.parent !== window) {
        window.parent.postMessage({ command: 'openTerminal', path: p }, '*');
    }
    if (window.vscode) {
        window.vscode.postMessage({ command: 'openTerminal', path: p });
    }
    // 2. HTTP Server Fallback (Standalone / C# Kestrel / Node)
    fetch('/api/files/openInTerminal?path=' + encodeURIComponent(p)).catch(() => {});
    const folderName = p.split(sep).filter(Boolean).pop() || p;
    showToast('Opening Integrated Terminal in "' + folderName + '" 💻', '💻');
}

function openTerminalAtCurrent() {
    openTerminal(currentPath);
}

function openTerminalAtSelection() {
    hideContextMenu();
    const sep = isWindows ? '\\' : '/';
    const p = selectedItem ? (selectedItem.path || (currentPath.endsWith(sep) ? currentPath + selectedItem.name : currentPath + sep + selectedItem.name)) : currentPath;
    openTerminal(p);
}

function openTerminalAtPreview() {
    const p = activePreviewPath || currentPath;
    openTerminal(p);
}

function openTerminalFromHover(e) {
    if (e) e.stopPropagation();
    hideHoverCard();
    const sep = isWindows ? '\\' : '/';
    const name = document.getElementById('hover-card-name') ? document.getElementById('hover-card-name').textContent : '';
    const p = name ? (currentPath.endsWith(sep) ? currentPath + name : currentPath + sep + name) : currentPath;
    openTerminal(p);
}


// ══════════════════════════════════════════════════════════
// 💻 TERMINAL, FINDER & CLIPBOARD ACTIONS
// ══════════════════════════════════════════════════════════
function revealSelectedItemInOS() {
    hideContextMenu();
    const sep = isWindows ? '\\' : '/';
    const p = selectedItem ? (currentPath.endsWith(sep) ? currentPath + selectedItem.name : currentPath + sep + selectedItem.name) : currentPath;
    if (window.parent && window.parent !== window) {
        window.parent.postMessage({ command: 'revealInOS', path: p }, '*');
    }
    fetch('/api/files/revealInOS?path=' + encodeURIComponent(p)).catch(() => {});
    showToast(isWindows ? 'Revealed in File Explorer' : 'Revealed in Finder', '📂');
}


// ══════════════════════════════════════════════════════════
// ⚖️ VISUAL FILE DIFF & COMPARISON
// ══════════════════════════════════════════════════════════
let activeDiffState = { fileA: '', fileB: '', data: null, mode: 'split' };

async function openVisualDiff(fileA, fileB) {
    hideContextMenu();
    const modal = document.getElementById('modal-diff');
    const container = document.getElementById('diff-body-container');
    const tagA = document.getElementById('diff-tag-a');
    const tagB = document.getElementById('diff-tag-b');
    const statsBox = document.getElementById('diff-stats-box');
    const statAdd = document.getElementById('diff-stat-add');
    const statDel = document.getElementById('diff-stat-del');
    const infoMsg = document.getElementById('diff-info-msg');

    activeDiffState.fileA = fileA;
    activeDiffState.fileB = fileB;
    activeDiffState.data = null;

    const nameA = fileA.split(/[\/\\]/).pop() || fileA;
    const nameB = fileB === 'HEAD' ? 'Git HEAD' : (fileB.split(/[\/\\]/).pop() || fileB);

    if (tagA) tagA.textContent = nameA;
    if (tagB) tagB.textContent = nameB;
    if (statsBox) statsBox.style.display = 'none';
    if (infoMsg) infoMsg.textContent = 'Computing diff...';

    if (container) {
        container.innerHTML = '<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; height: 100%; color: var(--text-muted);">' +
            '<div class="spinner" style="margin-bottom: 12px;"></div>' +
            '<div style="font-size: 13px; font-weight: 500;">Analyzing file differences...</div>' +
            '</div>';
    }

    if (modal) modal.classList.add('active');

    try {
        const res = await fetch('/api/files/diff?fileA=' + encodeURIComponent(fileA) + '&fileB=' + encodeURIComponent(fileB));
        const data = await res.json();
        const isFail = !res.ok || data.error || data.errorMessage || data.isBinary || (data.ok === false);
        if (isFail) {
            const errorText = data.error || data.errorMessage || (data.isBinary ? (data.message || 'Binary files cannot be displayed as text diff.') : 'Could not compute diff for selected files.');
            if (container) {
                container.innerHTML = '<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; height: 100%; color: var(--text-muted); padding: 20px; text-align: center;">' +
                    '<div style="font-size: 32px; margin-bottom: 8px;">' + (data.isBinary ? '📦' : '⚠️') + '</div>' +
                    '<div style="font-size: 14px; font-weight: 600; color: #fff;">' + (data.isBinary ? 'Binary File Comparison' : 'Diff Unavailable') + '</div>' +
                    '<div style="font-size: 12px; margin-top: 6px; max-width: 400px; color: var(--text-muted);">' + escapeHtml(errorText) + '</div>' +
                    '<button class="modal-btn" style="margin-top: 16px;" onclick="openDiffInVsCode()">🚀 Try Native VS Code Diff</button>' +
                    '</div>';
            }
            if (infoMsg) infoMsg.textContent = '';
            return;
        }

        activeDiffState.data = data;
        if (statsBox && data.stats) {
            statsBox.style.display = 'inline-flex';
            if (statAdd) statAdd.textContent = '+' + data.stats.added;
            if (statDel) statDel.textContent = '-' + data.stats.removed;
        }
        if (infoMsg && data.stats) {
            if (data.stats.added === 0 && data.stats.removed === 0) {
                infoMsg.textContent = '✓ Files are identical';
            } else {
                infoMsg.textContent = (data.stats.added + data.stats.removed) + ' differences found';
            }
        }

        renderDiffView();
    } catch (err) {
        if (container) {
            container.innerHTML = '<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; height: 100%; color: var(--text-muted);">' +
                '<div style="font-size: 13px; color: #ff8b8b;">Failed to load diff: ' + escapeHtml(err.message || err) + '</div>' +
                '</div>';
        }
    }
}

function closeVisualDiff(e) {
    if (e && e.target && e.target !== document.getElementById('modal-diff')) return;
    const modal = document.getElementById('modal-diff');
    if (modal) modal.classList.remove('active');
}

function setDiffMode(mode) {
    activeDiffState.mode = mode;
    const btnSplit = document.getElementById('diff-btn-split');
    const btnUnified = document.getElementById('diff-btn-unified');
    if (btnSplit) btnSplit.classList.toggle('active', mode === 'split');
    if (btnUnified) btnUnified.classList.toggle('active', mode === 'unified');
    renderDiffView();
}

function renderDiffView() {
    const container = document.getElementById('diff-body-container');
    const data = activeDiffState.data;
    if (!container || !data || !data.lines) return;

    const nameA = activeDiffState.fileA.split(/[\/\\]/).pop() || activeDiffState.fileA;
    const nameB = activeDiffState.fileB === 'HEAD' ? 'Git HEAD' : (activeDiffState.fileB.split(/[\/\\]/).pop() || activeDiffState.fileB);

    if (activeDiffState.mode === 'split') {
        let leftHtml = '';
        let rightHtml = '';

        for (let i = 0; i < data.lines.length; i++) {
            const row = data.lines[i];
            if (row.type === 'unchanged') {
                leftHtml += '<div class="diff-line-row"><span class="diff-num-col">' + (row.lineA || '') + '</span><span class="diff-text-col">' + escapeHtml(row.text) + '</span></div>';
                rightHtml += '<div class="diff-line-row"><span class="diff-num-col">' + (row.lineB || '') + '</span><span class="diff-text-col">' + escapeHtml(row.text) + '</span></div>';
            } else if (row.type === 'removed') {
                leftHtml += '<div class="diff-line-row removed"><span class="diff-num-col">' + (row.lineA || '') + '</span><span class="diff-text-col">' + escapeHtml(row.text) + '</span></div>';
                rightHtml += '<div class="diff-line-row empty"><span class="diff-num-col"></span><span class="diff-text-col">&nbsp;</span></div>';
            } else if (row.type === 'added') {
                leftHtml += '<div class="diff-line-row empty"><span class="diff-num-col"></span><span class="diff-text-col">&nbsp;</span></div>';
                rightHtml += '<div class="diff-line-row added"><span class="diff-num-col">' + (row.lineB || '') + '</span><span class="diff-text-col">' + escapeHtml(row.text) + '</span></div>';
            }
        }

        container.innerHTML = '<div class="diff-split-view">' +
            '<div class="diff-pane" id="diff-pane-left">' +
                '<div class="diff-pane-header"><span>' + escapeHtml(nameA) + '</span><span style="font-size: 10px; color: var(--text-muted);">Original</span></div>' +
                leftHtml +
            '</div>' +
            '<div class="diff-pane" id="diff-pane-right">' +
                '<div class="diff-pane-header"><span>' + escapeHtml(nameB) + '</span><span style="font-size: 10px; color: var(--text-muted);">' + (activeDiffState.fileB === 'HEAD' ? 'Git HEAD' : 'Modified') + '</span></div>' +
                rightHtml +
            '</div>' +
        '</div>';

        // Synchronize scrolling
        const pLeft = document.getElementById('diff-pane-left');
        const pRight = document.getElementById('diff-pane-right');
        if (pLeft && pRight) {
            let syncing = false;
            pLeft.addEventListener('scroll', function() {
                if (syncing) return;
                syncing = true;
                pRight.scrollTop = pLeft.scrollTop;
                pRight.scrollLeft = pLeft.scrollLeft;
                syncing = false;
            });
            pRight.addEventListener('scroll', function() {
                if (syncing) return;
                syncing = true;
                pLeft.scrollTop = pRight.scrollTop;
                pLeft.scrollLeft = pRight.scrollLeft;
                syncing = false;
            });
        }
    } else {
        // Unified View
        let unifiedHtml = '';
        for (let i = 0; i < data.lines.length; i++) {
            const row = data.lines[i];
            if (row.type === 'unchanged') {
                unifiedHtml += '<div class="diff-line-row"><span class="diff-num-col">' + (row.lineA || '') + '</span><span class="diff-num-col">' + (row.lineB || '') + '</span><span class="diff-text-col"> ' + escapeHtml(row.text) + '</span></div>';
            } else if (row.type === 'removed') {
                unifiedHtml += '<div class="diff-line-row removed"><span class="diff-num-col">' + (row.lineA || '') + '</span><span class="diff-num-col"></span><span class="diff-text-col">-' + escapeHtml(row.text) + '</span></div>';
            } else if (row.type === 'added') {
                unifiedHtml += '<div class="diff-line-row added"><span class="diff-num-col"></span><span class="diff-num-col">' + (row.lineB || '') + '</span><span class="diff-text-col">+' + escapeHtml(row.text) + '</span></div>';
            }
        }
        container.innerHTML = '<div class="diff-pane" style="width: 100%;">' +
            '<div class="diff-pane-header"><span>' + escapeHtml(nameA) + ' ↔ ' + escapeHtml(nameB) + '</span><span style="font-size: 10px; color: var(--text-muted);">Unified Diff</span></div>' +
            unifiedHtml +
        '</div>';
    }
}

function openDiffInVsCode() {
    if (!activeDiffState.fileA) return;
    if (window.parent && window.parent !== window) {
        if (activeDiffState.fileB === 'HEAD') {
            window.parent.postMessage({ command: 'diffWithHead', path: activeDiffState.fileA }, '*');
        } else {
            window.parent.postMessage({ command: 'diffFiles', fileA: activeDiffState.fileA, fileB: activeDiffState.fileB }, '*');
        }
    }
    showToast('Opening native VS Code diff editor...', '🚀');
}

function diffSelectedItemWithHead() {
    hideContextMenu();
    if (!selectedItem) return;
    const sep = isWindows ? '\\' : '/';
    const p = currentPath.endsWith(sep) ? currentPath + selectedItem.name : currentPath + sep + selectedItem.name;
    openVisualDiff(p, 'HEAD');
}

function diffSelectedPair() {
    hideContextMenu();
    if (selectedItems.length !== 2) {
        showToast('Please select exactly 2 files to compare', '⚠️');
        return;
    }
    const sep = isWindows ? '\\' : '/';
    const pA = (selectedItems[0].path) ? selectedItems[0].path : (currentPath.endsWith(sep) ? currentPath + selectedItems[0].name : currentPath + sep + selectedItems[0].name);
    const pB = (selectedItems[1].path) ? selectedItems[1].path : (currentPath.endsWith(sep) ? currentPath + selectedItems[1].name : currentPath + sep + selectedItems[1].name);
    openVisualDiff(pA, pB);
}

function computeRelativePath(fromDir, toPath) {
    if (!toPath) return '.';
    if (!fromDir || fromDir === '.') {
        const sep = isWindows ? '\\' : '/';
        const parts = toPath.split(sep).filter(Boolean);
        return './' + (parts.pop() || toPath);
    }
    const cleanFrom = fromDir.replace(/\\/g, '/').replace(/\/+$/, '');
    const cleanTo = toPath.replace(/\\/g, '/');
    if (cleanTo === cleanFrom) return '.';
    if (cleanTo.startsWith(cleanFrom + '/')) {
        return './' + cleanTo.substring(cleanFrom.length + 1);
    }
    // Cross-folder relative calculation
    const fromParts = cleanFrom.split('/').filter(Boolean);
    const toParts = cleanTo.split('/').filter(Boolean);
    let common = 0;
    while (common < fromParts.length && common < toParts.length && fromParts[common] === toParts[common]) {
        common++;
    }
    const upHops = fromParts.length - common;
    const downPath = toParts.slice(common).join('/');
    const rel = (upHops > 0 ? '../'.repeat(upHops) : './') + downPath;
    return rel;
}

function generateSmartImportSnippet(fullPath, fromDir) {
    if (!fullPath) return '';
    const sep = isWindows ? '\\' : '/';
    const parts = fullPath.split(sep).filter(Boolean);
    const fileName = parts.pop() || '';
    const dotIdx = fileName.lastIndexOf('.');
    const baseName = dotIdx > 0 ? fileName.substring(0, dotIdx) : fileName;
    const ext = dotIdx > 0 ? fileName.substring(dotIdx).toLowerCase() : '';
    const relPath = computeRelativePath(fromDir || currentPath, fullPath);
    const relNoExt = relPath.replace(/\.(tsx?|jsx?|mjs)$/i, '');

    // Form clean PascalCase / CamelCase identifier
    let symbol = baseName.replace(/[-_.]+(.)?/g, function(_, c) { return c ? c.toUpperCase() : ''; });
    if (symbol && /^[a-z]/.test(symbol)) symbol = symbol.charAt(0).toUpperCase() + symbol.slice(1);
    if (!symbol || !/^[A-Za-z_$]/.test(symbol)) symbol = 'Component';

    if (['.tsx', '.ts', '.jsx', '.js', '.mjs'].includes(ext)) {
        return "import { " + symbol + " } from '" + relNoExt + "';";
    } else if (['.vue', '.svelte'].includes(ext)) {
        return "import " + symbol + " from '" + relPath + "';";
    } else if (['.css', '.scss', '.sass', '.less'].includes(ext)) {
        return "@import '" + relPath + "';";
    } else if (ext === '.json') {
        return "import " + (baseName.replace(/[^a-zA-Z0-9_$]/g, '_') || 'data') + " from '" + relPath + "';";
    } else if (ext === '.py') {
        const mod = relNoExt.replace(/^\.\//, '').replace(/\//g, '.');
        return "from ." + mod + " import " + baseName;
    } else if (ext === '.cs') {
        return "using " + symbol + ";";
    } else if (['.png', '.jpg', '.jpeg', '.svg', '.gif', '.webp', '.ico'].includes(ext)) {
        return "![" + baseName + "](" + relPath + ")";
    } else if (ext === '.md' || ext === '.txt') {
        return "[" + baseName + "](" + relPath + ")";
    }
    return relPath;
}

function copyPathToClipboard(isRelative) {
    hideContextMenu();
    const sep = isWindows ? '\\' : '/';
    let full = selectedItem ? (selectedItem.path || (currentPath.endsWith(sep) ? currentPath + selectedItem.name : currentPath + sep + selectedItem.name)) : currentPath;
    let textToCopy = full;
    if (isRelative) {
        textToCopy = computeRelativePath(currentPath, full);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(textToCopy);
    }
    if (window.parent && window.parent !== window) {
        window.parent.postMessage({ command: 'copyToClipboard', text: textToCopy }, '*');
    }
    if (window.vscode) {
        window.vscode.postMessage({ command: 'copyToClipboard', text: textToCopy });
    }
    showToast(isRelative ? 'Copied relative path: ' + textToCopy : 'Copied absolute path', '📋');
}

function copySmartImportAtSelection() {
    hideContextMenu();
    const sep = isWindows ? '\\' : '/';
    const target = selectedItem ? (selectedItem.path || (currentPath.endsWith(sep) ? currentPath + selectedItem.name : currentPath + sep + selectedItem.name)) : currentPath;
    const snippet = generateSmartImportSnippet(target, currentPath);
    if (!snippet) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(snippet);
    }
    if (window.parent && window.parent !== window) {
        window.parent.postMessage({ command: 'copyToClipboard', text: snippet }, '*');
    }
    if (window.vscode) {
        window.vscode.postMessage({ command: 'copyToClipboard', text: snippet });
    }
    showToast('Copied: ' + snippet, '📦');
}

function copySmartImportAtPreview() {
    const target = activePreviewPath || currentPath;
    const snippet = generateSmartImportSnippet(target, currentPath);
    if (!snippet) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(snippet);
    }
    if (window.parent && window.parent !== window) {
        window.parent.postMessage({ command: 'copyToClipboard', text: snippet }, '*');
    }
    if (window.vscode) {
        window.vscode.postMessage({ command: 'copyToClipboard', text: snippet });
    }
    showToast('Copied import: ' + snippet, '📦');
}

function copySmartImportFromHover(e) {
    if (e) e.stopPropagation();
    hideHoverCard();
    const sep = isWindows ? '\\' : '/';
    const name = document.getElementById('hover-card-name') ? document.getElementById('hover-card-name').textContent : '';
    const target = name ? (currentPath.endsWith(sep) ? currentPath + name : currentPath + sep + name) : currentPath;
    const snippet = generateSmartImportSnippet(target, currentPath);
    if (!snippet) return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(snippet);
    }
    if (window.parent && window.parent !== window) {
        window.parent.postMessage({ command: 'copyToClipboard', text: snippet }, '*');
    }
    if (window.vscode) {
        window.vscode.postMessage({ command: 'copyToClipboard', text: snippet });
    }
    showToast('Copied import: ' + snippet, '📦');
}

function copyMarkdownRefAtSelection() {
    hideContextMenu();
    const sep = isWindows ? '\\' : '/';
    const target = selectedItem ? (selectedItem.path || (currentPath.endsWith(sep) ? currentPath + selectedItem.name : currentPath + sep + selectedItem.name)) : currentPath;
    const parts = target.split(sep).filter(Boolean);
    const name = parts.pop() || target;
    const rel = computeRelativePath(currentPath, target);
    const isImg = /\.(png|jpe?g|svg|gif|webp)$/i.test(name);
    const md = (isImg ? '![' : '[') + name + '](' + rel + ')';

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(md);
    }
    if (window.parent && window.parent !== window) {
        window.parent.postMessage({ command: 'copyToClipboard', text: md }, '*');
    }
    if (window.vscode) {
        window.vscode.postMessage({ command: 'copyToClipboard', text: md });
    }
    showToast('Copied Markdown reference: ' + md, '🔗');
}


// ✂️ CLIPBOARD (CUT / COPY / PASTE)
// ══════════════════════════════════════════════════════════
function copySelectedItem() {
    hideContextMenu();
    const items = selectedItems.length > 0 ? selectedItems.slice() : (selectedItem ? [selectedItem] : []);
    if (items.length === 0) return;
    const sep = isWindows ? '\\' : '/';
    const mapped = items.map(function(item) {
        const fullPath = item.path || (currentPath.endsWith(sep) ? currentPath + item.name : currentPath + sep + item.name);
        return { path: fullPath, name: item.name };
    });
    clipboard = { action: 'copy', items: mapped, path: mapped[0].path, name: mapped[0].name };
    updateSelectionState();
    const btnPaste = document.getElementById('btn-paste');
    if (btnPaste) btnPaste.disabled = false;
    setMenuEntryDisabled('menu-item-paste', false);
    showToast(items.length === 1 ? 'Copied "' + items[0].name + '" to clipboard' : 'Copied ' + items.length + ' items to clipboard', '📋');
}

function cutSelectedItem() {
    hideContextMenu();
    const items = selectedItems.length > 0 ? selectedItems.slice() : (selectedItem ? [selectedItem] : []);
    if (items.length === 0) return;
    const sep = isWindows ? '\\' : '/';
    const mapped = items.map(function(item) {
        const fullPath = item.path || (currentPath.endsWith(sep) ? currentPath + item.name : currentPath + sep + item.name);
        return { path: fullPath, name: item.name };
    });
    clipboard = { action: 'cut', items: mapped, path: mapped[0].path, name: mapped[0].name };
    updateSelectionState();
    const btnPaste = document.getElementById('btn-paste');
    if (btnPaste) btnPaste.disabled = false;
    setMenuEntryDisabled('menu-item-paste', false);
    applyFilterAndRender();
    showToast(items.length === 1 ? 'Cut "' + items[0].name + '" (ready to paste)' : 'Cut ' + items.length + ' items (ready to paste)', '✂️');
}

async function pasteClipboardItem() {
    hideContextMenu();
    if (!clipboard) return;
    const items = clipboard.items || [{ path: clipboard.path, name: clipboard.name }];
    const endpoint = clipboard.action === 'cut' ? '/api/files/move' : '/api/files/copy';
    let successCount = 0;
    for (let i = 0; i < items.length; i++) {
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ source: items[i].path, destinationDir: currentPath })
            });
            if (res.ok) successCount++;
        } catch {}
    }
    if (successCount > 0) {
        showToast((clipboard.action === 'cut' ? 'Moved ' : 'Copied ') + successCount + (successCount === 1 ? ' item' : ' items') + ' successfully', '✅');
        if (clipboard.action === 'cut') clipboard = null;
        const btnPaste = document.getElementById('btn-paste');
        if (btnPaste) btnPaste.disabled = !clipboard;
        setMenuEntryDisabled('menu-item-paste', !clipboard);
        loadFiles(currentPath);
    } else {
        showToast('Failed to paste item(s)', '❌');
    }
}

// ══════════════════════════════════════════════════════════

// ✏️ CRUD MODALS (CREATE, RENAME, DELETE)
// ══════════════════════════════════════════════════════════
function showNewFolderModal() {
    hideContextMenu();
    document.getElementById('input-new-folder').value = '';
    document.getElementById('modal-new-folder').style.display = 'flex';
    setTimeout(function() { document.getElementById('input-new-folder').focus(); }, 50);
}

function showNewFileModal() {
    hideContextMenu();
    document.getElementById('input-new-file').value = '';
    document.getElementById('modal-new-file').style.display = 'flex';
    setTimeout(function() { document.getElementById('input-new-file').focus(); }, 50);
}

function renameSelectedItem() {
    hideContextMenu();
    if (!selectedItem) return;
    document.getElementById('input-rename').value = selectedItem.name;
    document.getElementById('modal-rename').style.display = 'flex';
    setTimeout(function() {
        const input = document.getElementById('input-rename');
        input.focus();
        const dotIdx = selectedItem.name.lastIndexOf('.');
        if (dotIdx > 0 && selectedItem.type === 'File') {
            input.setSelectionRange(0, dotIdx);
        } else {
            input.select();
        }
    }, 50);
}

function deleteSelectedItem() {
    hideContextMenu();
    const count = selectedItems.length;
    if (count === 0 && !selectedItem) return;
    const trashTerm = isWindows ? 'Recycle Bin' : 'Trash';
    if (count > 1) {
        document.getElementById('delete-prompt-text').innerHTML = 'Move these <strong>' + count + ' items</strong> to the ' + trashTerm + '?';
    } else {
        const target = selectedItem || selectedItems[0];
        document.getElementById('delete-prompt-text').innerHTML = 'Move <strong>' + escapeHtml(target.name) + '</strong> to the ' + trashTerm + '?';
    }
    const modal = document.getElementById('modal-delete');
    if (modal) {
        modal.style.display = 'flex';
        setTimeout(function() {
            const btn = document.getElementById('btn-confirm-delete');
            if (btn) btn.focus();
        }, 50);
    }
}

function hideModals() {
    document.querySelectorAll('.modal-overlay').forEach(function(m) { m.style.display = 'none'; });
}

function openHelpModal(tab = 'shortcuts') {
    hideContextMenu();
    hideModals();
    switchHelpTab(tab);
    const modal = document.getElementById('modal-help');
    if (modal) modal.style.display = 'flex';
}

function switchHelpTab(tabName) {
    document.querySelectorAll('.help-tab-btn').forEach(function(btn) { btn.classList.remove('active'); });
    document.querySelectorAll('.help-pane').forEach(function(pane) { pane.classList.remove('active'); });

    const activeBtn = document.getElementById('help-btn-' + tabName);
    if (activeBtn) activeBtn.classList.add('active');

    const activePane = document.getElementById('help-pane-' + tabName);
    if (activePane) activePane.classList.add('active');
}

function updateAboutVersionDisplay() {
    try {
        const badge = document.getElementById('about-version-badge');
        if (badge) badge.textContent = 'v' + extensionVersion;

        const infoVer = document.getElementById('about-info-version');
        if (infoVer) infoVer.textContent = extensionVersion;

        document.querySelectorAll('.extension-version-text').forEach(function(el) {
            el.textContent = extensionVersion;
        });

        const infoIde = document.getElementById('about-info-ide');
        if (infoIde) infoIde.textContent = (detectedIdeName && detectedIdeName !== 'IDE') ? detectedIdeName : 'Visual Studio Code';

        const infoEngine = document.getElementById('about-info-engine');
        if (infoEngine) infoEngine.textContent = backendEngineName;

        const helpEngine = document.getElementById('help-about-engine-text');
        if (helpEngine) helpEngine.textContent = backendEngineName;

        const infoUrl = document.getElementById('about-info-url');
        if (infoUrl) infoUrl.textContent = window.location.origin || 'http://localhost:5050';

        const infoOs = document.getElementById('about-info-os');
        if (infoOs) {
            let osName = 'Unknown OS';
            const ua = typeof navigator !== 'undefined' ? (navigator.userAgent || '') : '';
            const plat = typeof navigator !== 'undefined' ? (navigator.platform || '') : '';
            if (/Win/i.test(plat) || /Win/i.test(ua)) {
                osName = 'Windows';
            } else if (/Mac/i.test(plat) || /Mac/i.test(ua)) {
                osName = 'macOS';
            } else if (/Linux/i.test(plat) || /Linux/i.test(ua)) {
                osName = 'Linux';
            }
            infoOs.textContent = osName;
        }
    } catch (e) {
        console.warn('Error updating about version display', e);
    }
}

async function openAboutModal() {
    hideContextMenu();
    hideModals();
    updateAboutVersionDisplay();

    const modal = document.getElementById('modal-about');
    if (!modal) return;

    // Check engine status asynchronously to update status pill
    try {
        const res = await fetch('/api/env/info').catch(() => null);
        const pill = document.getElementById('about-engine-status-pill');
        if (res && res.ok) {
            const data = await res.json().catch(() => null);
            if (data) {
                if (data.version) extensionVersion = data.version;
                if (data.engine) backendEngineName = data.engine;
                updateAboutVersionDisplay();
            }
            if (pill) {
                pill.textContent = '● Online (' + (backendEngineName.includes('.NET') ? '.NET' : 'Node') + ')';
                pill.style.color = '#2ecc71';
                pill.style.background = 'rgba(46, 204, 113, 0.15)';
                pill.style.borderColor = 'rgba(46, 204, 113, 0.3)';
            }
        } else {
            if (pill) {
                pill.textContent = '● Connecting / Fallback';
                pill.style.color = '#f39c12';
                pill.style.background = 'rgba(243, 156, 18, 0.15)';
                pill.style.borderColor = 'rgba(243, 156, 18, 0.3)';
            }
        }
    } catch {}

    modal.style.display = 'flex';
}

function copyAboutSystemInfo() {
    let osName = 'Unknown OS';
    const ua = typeof navigator !== 'undefined' ? (navigator.userAgent || '') : '';
    const plat = typeof navigator !== 'undefined' ? (navigator.platform || '') : '';
    if (/Win/i.test(plat) || /Win/i.test(ua)) {
        osName = 'Windows';
    } else if (/Mac/i.test(plat) || /Mac/i.test(ua)) {
        osName = 'macOS';
    } else if (/Linux/i.test(plat) || /Linux/i.test(ua)) {
        osName = 'Linux';
    }

    const info = [
        'VenEl File Manager System Info:',
        '--------------------------------',
        `Extension Version: ${extensionVersion}`,
        `Host IDE: ${(detectedIdeName && detectedIdeName !== 'IDE') ? detectedIdeName : 'Visual Studio Code'}`,
        `Operating System: ${osName} (${plat})`,
        `Backend Engine: ${backendEngineName}`,
        `Engine Origin: ${window.location.origin || 'http://localhost:5050'}`,
        `User Agent: ${ua}`,
        `Timestamp: ${new Date().toISOString()}`
    ].join('\n');

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(info).then(function() {
            showToast('System info copied to clipboard! 📋', '✅');
        }).catch(function() {
            fallbackCopyText(info);
        });
    } else {
        fallbackCopyText(info);
    }
}

function fallbackCopyText(text) {
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('System info copied to clipboard! 📋', '✅');
    } catch {
        showToast('Could not copy system info', '⚠️');
    }
}

function updateEngineStatusPill(data) {
    const pill = document.getElementById('status-engine-pill');
    const dot = document.getElementById('status-engine-dot');
    const label = document.getElementById('status-engine-label');
    if (!pill || !dot || !label) return;

    const engine = (data && data.engine) || backendEngineName || 'Kestrel (.NET)';
    const isSafeMode = engine.includes('Node') || (data && data.engineTier === 3);

    if (isSafeMode) {
        dot.style.color = '#f39c12';
        label.textContent = 'Safe Mode (Node)';
        pill.title = 'Running in Zero-Dependency Safe Mode. All local file operations are active. (Click to inspect or re-check)';
    } else {
        dot.style.color = '#2ecc71';
        label.textContent = 'Kestrel (.NET)';
        pill.title = 'Running on high-performance .NET Kestrel engine. (Click to inspect)';
    }
}
window.updateEngineStatusPill = updateEngineStatusPill;

function openExternalLink(url) {
    if (!url) return;
    try {
        if (typeof window.vscode !== 'undefined' && window.vscode.postMessage) {
            window.vscode.postMessage({ command: 'openExternalUrl', url: url });
        }
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ command: 'openExternalUrl', url: url }, '*');
        }
    } catch {}
    try {
        window.open(url, '_blank', 'noopener,noreferrer');
    } catch {}
}
window.openExternalLink = openExternalLink;

function openSftpSafeModeModal() {
    hideContextMenu();
    hideModals();
    const modal = document.getElementById('modal-sftp-safe-mode');
    if (modal) modal.style.display = 'flex';
}
window.openSftpSafeModeModal = openSftpSafeModeModal;

async function openEngineStatusModal() {
    hideContextMenu();
    hideModals();
    const modal = document.getElementById('modal-engine-status');
    if (!modal) return;
    modal.style.display = 'flex';

    const pill = document.getElementById('engine-diag-pill');
    const nameEl = document.getElementById('engine-diag-name');
    const descEl = document.getElementById('engine-diag-desc');
    const sftpCap = document.getElementById('engine-diag-sftp-cap');

    try {
        const res = await fetch('/api/env/info').catch(() => null);
        if (res && res.ok) {
            const data = await res.json().catch(() => null);
            if (data) {
                if (data.version) extensionVersion = data.version;
                if (data.engine) backendEngineName = data.engine;
                if (data.capabilities) window.currentEngineCapabilities = data.capabilities;
                updateEngineStatusPill(data);

                const isSafeMode = (data.engine && data.engine.includes('Node')) || (data.engineTier === 3);
                if (isSafeMode) {
                    if (pill) {
                        pill.textContent = '● Safe Mode';
                        pill.style.background = 'rgba(243, 156, 18, 0.15)';
                        pill.style.color = '#f39c12';
                        pill.style.borderColor = 'rgba(243, 156, 18, 0.3)';
                    }
                    if (nameEl) nameEl.textContent = 'Node.js (Safe Mode)';
                    if (descEl) descEl.textContent = data.diagnosticMessage || 'Zero-dependency fallback active. All local file operations, multi-tabs, dual-pane commander, and batch tools are fully functional.';
                    if (sftpCap) {
                        sftpCap.textContent = '⏸️ On Standby (Requires .NET)';
                        sftpCap.style.color = '#f39c12';
                    }
                } else {
                    if (pill) {
                        pill.textContent = '● Online (.NET)';
                        pill.style.background = 'rgba(46, 204, 113, 0.15)';
                        pill.style.color = '#2ecc71';
                        pill.style.borderColor = 'rgba(46, 204, 113, 0.3)';
                    }
                    if (nameEl) nameEl.textContent = 'Kestrel (.NET)';
                    if (descEl) descEl.textContent = 'High-performance native file indexing and active SFTP remote proxy.';
                    if (sftpCap) {
                        sftpCap.textContent = '✅ Active';
                        sftpCap.style.color = '#2ecc71';
                    }
                }
            }
        }
    } catch (e) {
        console.warn('Failed to query /api/env/info for engine modal', e);
    }
}
window.openEngineStatusModal = openEngineStatusModal;

async function recheckEngine() {
    const btn = document.getElementById('btn-recheck-engine');
    const oldText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.innerHTML = '<span>⏳</span><span>Probing Engine...</span>';
        btn.disabled = true;
    }
    showToast('Probing for .NET runtime and Kestrel engine...', '⚡');

    try {
        const res = await fetch('/api/engine/retry').catch(() => null);
        if (res && res.ok) {
            const data = await res.json().catch(() => null);
            if (data && data.success) {
                backendEngineName = data.engine || 'Kestrel (.NET)';
                showToast(data.message || '⚡ Promoted to high-performance .NET Kestrel engine!', '🚀');
                updateEngineStatusPill({ engine: backendEngineName });
                hideModals();
                setTimeout(() => {
                    refreshFiles();
                }, 500);
                return;
            } else {
                showToast('ℹ️ ' + ((data && data.message) || 'Safe Mode remains active. No .NET runtime found yet.'), '🛡️');
            }
        } else {
            showToast('Safe Mode active. Could not start Kestrel engine.', '🛡️');
        }
    } catch (e) {
        showToast('Engine check completed: Safe Mode remains active.', 'ℹ️');
    } finally {
        if (btn) {
            btn.innerHTML = oldText;
            btn.disabled = false;
        }
        const engineModal = document.getElementById('modal-engine-status');
        if (engineModal && engineModal.classList.contains('active')) {
            openEngineStatusModal();
        }
    }
}
window.recheckEngine = recheckEngine;

// Global external link interceptor to prevent VS Code iframe swallowing
document.addEventListener('click', function(e) {
    const anchor = e.target && e.target.closest ? e.target.closest('a') : null;
    if (anchor && anchor.href && /^https?:\/\//i.test(anchor.href)) {
        if (anchor.target === '_blank' || anchor.getAttribute('target') === '_blank') {
            e.preventDefault();
            e.stopPropagation();
            openExternalLink(anchor.href);
        }
    }
}, true);

let cachedRecentLogs = '';

function openLogsFolder() {
    if (typeof window.vscode !== 'undefined' && window.vscode.postMessage) {
        window.vscode.postMessage({ command: 'openLogsFolder' });
    } else if (window.parent && window.parent !== window) {
        window.parent.postMessage({ command: 'openLogsFolder' }, '*');
    }
    showToast('Revealing diagnostic logs folder... 📂', '📂');
}

async function openReportIssueModal() {
    hideContextMenu();
    hideModals();

    const modal = document.getElementById('modal-report-issue');
    if (!modal) return;

    const titleInput = document.getElementById('issue-title-input');
    const descInput = document.getElementById('issue-description-input');
    const sysPreview = document.getElementById('issue-system-preview');
    const logsPreview = document.getElementById('issue-logs-preview');

    let osName = 'Unknown OS';
    const ua = typeof navigator !== 'undefined' ? (navigator.userAgent || '') : '';
    const plat = typeof navigator !== 'undefined' ? (navigator.platform || '') : '';
    if (/Win/i.test(plat) || /Win/i.test(ua)) osName = 'Windows';
    else if (/Mac/i.test(plat) || /Mac/i.test(ua)) osName = 'macOS';
    else if (/Linux/i.test(plat) || /Linux/i.test(ua)) osName = 'Linux';

    const hostIde = (detectedIdeName && detectedIdeName !== 'IDE') ? detectedIdeName : 'Visual Studio Code';

    if (sysPreview) {
        sysPreview.innerHTML = `
            <strong>Version:</strong> ${extensionVersion} &bull;
            <strong>IDE:</strong> ${hostIde} &bull;
            <strong>OS:</strong> ${osName} (${plat || 'x64'}) &bull;
            <strong>Engine:</strong> ${backendEngineName}
        `;
    }

    if (logsPreview) {
        logsPreview.textContent = cachedRecentLogs || 'Fetching recent diagnostic logs...';
    }

    if (typeof window.vscode !== 'undefined' && window.vscode.postMessage) {
        window.vscode.postMessage({ command: 'getRecentLogs' });
    } else if (window.parent && window.parent !== window) {
        window.parent.postMessage({ command: 'getRecentLogs' }, '*');
    }

    try {
        fetch('/api/logs/recent')
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (data && data.logs && logsPreview) {
                    cachedRecentLogs = data.logs;
                    logsPreview.textContent = data.logs;
                }
            })
            .catch(() => {});
    } catch {}

    modal.style.display = 'flex';
    if (titleInput) {
        setTimeout(() => titleInput.focus(), 80);
    }
}

function submitIssueReport() {
    const titleInput = document.getElementById('issue-title-input');
    const descInput = document.getElementById('issue-description-input');
    const includeLogsCheckbox = document.getElementById('issue-include-logs');
    const logsPreview = document.getElementById('issue-logs-preview');

    const userTitle = titleInput && titleInput.value.trim() ? titleInput.value.trim() : 'Unexpected issue in VenEl File Manager';
    const userDesc = descInput && descInput.value.trim() ? descInput.value.trim() : '_No description provided._';
    const includeLogs = includeLogsCheckbox ? includeLogsCheckbox.checked : true;

    let osName = 'Unknown OS';
    const ua = typeof navigator !== 'undefined' ? (navigator.userAgent || '') : '';
    const plat = typeof navigator !== 'undefined' ? (navigator.platform || '') : '';
    if (/Win/i.test(plat) || /Win/i.test(ua)) osName = 'Windows';
    else if (/Mac/i.test(plat) || /Mac/i.test(ua)) osName = 'macOS';
    else if (/Linux/i.test(plat) || /Linux/i.test(ua)) osName = 'Linux';

    const hostIde = (detectedIdeName && detectedIdeName !== 'IDE') ? detectedIdeName : 'Visual Studio Code';
    const logsText = (logsPreview && logsPreview.textContent && !logsPreview.textContent.startsWith('Fetching'))
        ? logsPreview.textContent
        : (cachedRecentLogs || 'No recent errors captured.');

    let body = `### Description\n${userDesc}\n\n`;

    if (includeLogs) {
        body += `### Environment & Diagnostics\n`;
        body += `- **Extension Version**: \`${extensionVersion}\`\n`;
        body += `- **Host IDE**: ${hostIde}\n`;
        body += `- **Operating System**: ${osName} (${plat})\n`;
        body += `- **Backend Engine**: ${backendEngineName}\n`;
        body += `- **Engine Endpoint**: \`${window.location.origin || 'http://localhost:5050'}\`\n`;
        body += `- **Timestamp**: ${new Date().toISOString()}\n\n`;
        body += `### Diagnostic Logs\n\`\`\`\n${logsText}\n\`\`\`\n`;
    }

    const issueUrl = 'https://github.com/venkateshellur/VenEl.FileManagerExtension/issues/new?title=' +
        encodeURIComponent('[Bug]: ' + userTitle) +
        '&body=' + encodeURIComponent(body) +
        '&labels=bug';

    if (typeof window.vscode !== 'undefined' && window.vscode.postMessage) {
        window.vscode.postMessage({ command: 'openExternalUrl', url: issueUrl });
    } else if (window.parent && window.parent !== window) {
        window.parent.postMessage({ command: 'openExternalUrl', url: issueUrl }, '*');
    } else {
        window.open(issueUrl, '_blank');
    }

    hideModals();
    showToast('Opening GitHub issue form... 🚀', '✅');
}

function openSettingsModal() {
    hideContextMenu();
    const modal = document.getElementById('modal-settings');
    if (!modal) return;
    const urlElem = document.getElementById('modal-engine-url');
    if (urlElem) urlElem.textContent = window.location.origin || 'http://localhost:5050';
    modal.style.display = 'flex';
}

async function pingEngineStatus() {
    const statusElem = document.getElementById('modal-engine-status');
    const dotElem = document.getElementById('modal-engine-dot');
    if (statusElem) statusElem.textContent = 'Connecting...';
    try {
        const res = await fetch('/api/files/roots');
        if (res.ok) {
            if (statusElem) statusElem.textContent = 'Ready & Online';
            if (dotElem) {
                dotElem.style.background = '#2ecc71';
                dotElem.style.boxShadow = '0 0 6px #2ecc71';
            }
            showToast('Engine is online and operational', '✅');
        } else {
            if (statusElem) statusElem.textContent = 'HTTP ' + res.status;
            if (dotElem) {
                dotElem.style.background = '#e74c3c';
                dotElem.style.boxShadow = '0 0 6px #e74c3c';
            }
            showToast('Engine responded with error', '⚠️');
        }
    } catch {
        if (statusElem) statusElem.textContent = 'Offline';
        if (dotElem) {
            dotElem.style.background = '#e74c3c';
            dotElem.style.boxShadow = '0 0 6px #e74c3c';
        }
        showToast('Engine unreachable', '❌');
    }
}

function openVsCodeExtensionSettings() {
    if (window.parent && window.parent !== window) {
        window.parent.postMessage({ command: 'openSettings' }, '*');
    }
    fetch('/api/files/openSettings').catch(() => {});
    showToast('Opening settings in VS Code...', '⚙️');
}

function toggleVsCodeSidebar() {
    if (window.parent && window.parent !== window) {
        window.parent.postMessage({ command: 'toggleSidebar' }, '*');
    }
    fetch('/api/files/toggleSidebar').catch(() => {});
    showToast('Toggled primary sidebar', '◨');
}

function handleModalKey(e, confirmFn) {
    if (e.key === 'Enter') confirmFn();
}

async function createFolder() {
    const name = document.getElementById('input-new-folder').value.trim();
    if (!name) return;
    hideModals();

    const sftpInfo = parseSftpUrl(currentPath);
    if (sftpInfo) {
        try {
            const res = await fetch('/api/sftp/newFolder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ connectionId: sftpInfo.connectionId, currentPath: sftpInfo.remotePath, folderName: name })
            });
            if (res.ok) {
                showToast('Created remote folder "' + name + '"', '📁');
                loadFiles(currentPath);
            } else {
                showToast('Could not create folder on SFTP', '❌');
            }
        } catch {
            showToast('Error creating folder on SFTP', '❌');
        }
        return;
    }

    const cloudInfo = parseCloudUrl(currentPath);
    if (cloudInfo) {
        try {
            const prefix = cloudInfo.remotePath === '/' ? '' : (cloudInfo.remotePath.startsWith('/') ? cloudInfo.remotePath.substring(1) : cloudInfo.remotePath);
            const res = await fetch('/api/cloud/createFolder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ connectionId: cloudInfo.connectionId, currentPrefix: prefix, folderName: name })
            });
            if (res.ok) {
                showToast('Created cloud folder "' + name + '"', '📁');
                loadFiles(currentPath);
            } else {
                showToast('Could not create folder on Cloud Storage', '❌');
            }
        } catch {
            showToast('Error creating folder on Cloud Storage', '❌');
        }
        return;
    }

    try {
        const res = await fetch('/api/files/newFolder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPath: currentPath, folderName: name })
        });
        if (res.ok) {
            showToast('Created folder "' + name + '"', '📁');
            loadFiles(currentPath);
        } else {
            showToast('Could not create folder', '❌');
        }
    } catch {
        showToast('Error creating folder', '❌');
    }
}

async function createFile() {
    const name = document.getElementById('input-new-file').value.trim();
    if (!name) return;
    hideModals();

    const sftpInfo = parseSftpUrl(currentPath);
    if (sftpInfo) {
        try {
            const res = await fetch('/api/sftp/newFile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ connectionId: sftpInfo.connectionId, currentPath: sftpInfo.remotePath, fileName: name, content: '' })
            });
            if (res.ok) {
                showToast('Created remote file "' + name + '"', '📄');
                loadFiles(currentPath);
            } else {
                showToast('Could not create file on SFTP', '❌');
            }
        } catch {
            showToast('Error creating file on SFTP', '❌');
        }
        return;
    }

    const cloudInfo = parseCloudUrl(currentPath);
    if (cloudInfo) {
        try {
            const prefix = cloudInfo.remotePath === '/' ? '' : (cloudInfo.remotePath.startsWith('/') ? cloudInfo.remotePath.substring(1) : cloudInfo.remotePath);
            const key = prefix ? (prefix.endsWith('/') ? prefix + name : prefix + '/' + name) : name;
            const res = await fetch('/api/cloud/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ connectionId: cloudInfo.connectionId, remotePath: key, content: '' })
            });
            if (res.ok) {
                showToast('Created cloud file "' + name + '"', '📄');
                loadFiles(currentPath);
            } else {
                showToast('Could not create file on Cloud Storage', '❌');
            }
        } catch {
            showToast('Error creating file on Cloud Storage', '❌');
        }
        return;
    }

    try {
        const res = await fetch('/api/files/newFile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPath: currentPath, fileName: name, content: '' })
        });
        if (res.ok) {
            showToast('Created file "' + name + '"', '📄');
            loadFiles(currentPath);
        } else {
            showToast('Could not create file', '❌');
        }
    } catch {
        showToast('Error creating file', '❌');
    }
}

async function submitRename() {
    const newName = document.getElementById('input-rename').value.trim();
    if (!newName || !selectedItem || newName === selectedItem.name) {
        hideModals();
        return;
    }
    hideModals();

    const sftpInfo = parseSftpUrl(currentPath);
    if (sftpInfo) {
        try {
            const oldRemote = sftpInfo.remotePath === '/' ? '/' + selectedItem.name : sftpInfo.remotePath + '/' + selectedItem.name;
            const res = await fetch('/api/sftp/rename', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ connectionId: sftpInfo.connectionId, oldPath: oldRemote, newName: newName })
            });
            if (res.ok) {
                showToast('Renamed remote item to "' + newName + '"', '✏️');
                loadFiles(currentPath);
            } else {
                showToast('SFTP rename failed', '❌');
            }
        } catch {
            showToast('Error renaming item on SFTP', '❌');
        }
        return;
    }

    const sep = isWindows ? '\\' : '/';
    const oldPath = currentPath.endsWith(sep) ? currentPath + selectedItem.name : currentPath + sep + selectedItem.name;
    try {
        const res = await fetch('/api/files/rename', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oldPath: oldPath, newName: newName })
        });
        if (res.ok) {
            showToast('Renamed to "' + newName + '"', '✏️');
            loadFiles(currentPath);
        } else {
            showToast('Rename failed', '❌');
        }
    } catch {
        showToast('Error renaming item', '❌');
    }
}

async function submitDelete() {
    hideModals();
    const itemsToDelete = selectedItems.length > 0 ? selectedItems.slice() : (selectedItem ? [selectedItem] : []);
    if (itemsToDelete.length === 0) return;

    const sftpInfo = parseSftpUrl(currentPath);
    if (sftpInfo) {
        showToast('Deleting ' + itemsToDelete.length + ' remote item(s)...', '⏳');
        let successCount = 0;
        for (const item of itemsToDelete) {
            try {
                const remoteTarget = sftpInfo.remotePath === '/' ? '/' + item.name : sftpInfo.remotePath + '/' + item.name;
                const res = await fetch('/api/sftp/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        connectionId: sftpInfo.connectionId,
                        targetPath: remoteTarget,
                        isDirectory: item.type === 'Directory'
                    })
                });
                if (res.ok) successCount++;
            } catch {}
        }
        if (successCount > 0) {
            showToast('Deleted ' + successCount + ' remote item(s)', '🗑️');
            selectedItem = null;
            selectedItems = [];
            lastSelectedName = null;
            loadFiles(currentPath);
        } else {
            showToast('Failed to delete remote item(s)', '❌');
        }
        return;
    }

    const cloudInfo = parseCloudUrl(currentPath);
    if (cloudInfo) {
        showToast('Deleting ' + itemsToDelete.length + ' cloud item(s)...', '⏳');
        let successCount = 0;
        for (const item of itemsToDelete) {
            try {
                const prefix = cloudInfo.remotePath === '/' ? '' : (cloudInfo.remotePath.startsWith('/') ? cloudInfo.remotePath.substring(1) : cloudInfo.remotePath);
                const itemKey = item.key || (prefix ? (prefix.endsWith('/') ? prefix + item.name : prefix + '/' + item.name) : item.name);
                const res = await fetch('/api/cloud/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        connectionId: cloudInfo.connectionId,
                        key: itemKey,
                        isDirectory: item.type === 'Directory' || item.isDir
                    })
                });
                if (res.ok) successCount++;
            } catch {}
        }
        if (successCount > 0) {
            showToast('Deleted ' + successCount + ' cloud item(s)', '🗑️');
            selectedItem = null;
            selectedItems = [];
            lastSelectedName = null;
            loadFiles(currentPath);
        } else {
            showToast('Failed to delete cloud item(s)', '❌');
        }
        return;
    }

    const sep = isWindows ? '\\' : '/';
    const trashTerm = isWindows ? 'Recycle Bin' : 'Trash';
    const paths = itemsToDelete.map(function(item) {
        return item.path || (currentPath.endsWith(sep) ? currentPath + item.name : currentPath + sep + item.name);
    });

    showToast('Moving ' + paths.length + ' item' + (paths.length === 1 ? '' : 's') + ' to ' + trashTerm + '...', '⏳');
    try {
        const res = await fetch('/api/files/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                paths: paths,
                targetPath: paths[0]
            })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            const count = data.count !== undefined ? data.count : paths.length;
            showToast('Moved ' + count + (count === 1 ? ' item' : ' items') + ' to ' + trashTerm, '🗑️');
            selectedItem = null;
            selectedItems = [];
            lastSelectedName = null;
            loadFiles(currentPath);
            return;
        } else {
            showToast('Failed to move to ' + trashTerm + ': ' + (data.error || 'Server error'), '❌');
            return;
        }
    } catch (err) {
        console.warn('Batch trash failed, trying item by item...', err);
    }

    // Fallback: delete item by item
    let successCount = 0;
    for (let i = 0; i < paths.length; i++) {
        try {
            const res = await fetch('/api/files/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetPath: paths[i] })
            });
            if (res.ok) successCount++;
        } catch {}
    }
    if (successCount > 0) {
        showToast('Moved ' + successCount + (successCount === 1 ? ' item' : ' items') + ' to ' + trashTerm, '🗑️');
        selectedItem = null;
        selectedItems = [];
        lastSelectedName = null;
        loadFiles(currentPath);
    } else {
        showToast('Failed to move to ' + trashTerm, '❌');
    }
}

// ══════════════════════════════════════════════════════════
// 🖱️ CONTEXT MENU
// ══════════════════════════════════════════════════════════
function handleItemContextMenu(e, name, isDir) {
    e.preventDefault();
    e.stopPropagation();

    const isAlreadySelected = selectedItems.some(function(i) { return i.name === name; });
    if (!isAlreadySelected) {
        const item = currentItems.find(function(i) { return i.name === name; }) || { name: name, type: isDir ? 'Directory' : 'File' };
        selectedItems = [item];
        selectedItem = item;
        lastSelectedName = name;
        syncItemSelectionDOM();
        updateSelectionState();
    }

    const count = selectedItems.length;
    const isSingle = count === 1;

    const menu = document.getElementById('context-menu');
    const newTabItem = document.getElementById('ctx-new-tab');
    if (newTabItem) newTabItem.style.display = 'none';
    document.getElementById('ctx-open').style.display = (isSingle && !isDir) ? 'flex' : 'none';
    const ctxOpenLabel = document.getElementById('ctx-open-label');
    if (ctxOpenLabel) ctxOpenLabel.textContent = 'Open in ' + detectedIdeName + ' Editor';

    const openSystemItem = document.getElementById('ctx-open-system');
    if (openSystemItem) {
        openSystemItem.style.display = (isSingle && !isDir) ? 'flex' : 'none';
        const label = document.getElementById('ctx-open-system-label');
        if (label) label.textContent = getSystemAppFriendlyLabel(name);
    }

    const runScriptItem = document.getElementById('ctx-run-script');
    if (runScriptItem) {
        const isScript = isSingle && !isDir && isScriptFile(name);
        runScriptItem.style.display = isScript ? 'flex' : 'none';
        const label = document.getElementById('ctx-run-script-label');
        if (label) {
            const ext = name.substring(name.lastIndexOf('.')).toLowerCase();
            label.textContent = (ext === '.bat' || ext === '.cmd') ? 'Run Batch File in Terminal' : 'Run Script in Terminal';
        }
    }

    const openTabItem = document.getElementById('ctx-open-new-tab');
    if (openTabItem) openTabItem.style.display = (isSingle && isDir) ? 'flex' : 'none';
    document.getElementById('ctx-quicklook').style.display = isSingle ? 'flex' : 'none';
    document.getElementById('ctx-rename').style.display = isSingle ? 'flex' : 'none';
    document.getElementById('ctx-copy').style.display = 'flex';
    document.getElementById('ctx-cut').style.display = 'flex';
    document.getElementById('ctx-delete').style.display = 'flex';
    document.getElementById('ctx-properties').style.display = isSingle ? 'flex' : 'none';
    document.getElementById('ctx-terminal-item').style.display = 'flex';
    document.getElementById('ctx-reveal-item').style.display = isSingle ? 'flex' : 'none';
    document.getElementById('ctx-reveal-label').textContent = isWindows ? 'Reveal in File Explorer' : 'Reveal in Finder';
    document.getElementById('ctx-copy-path').style.display = 'flex';
    document.getElementById('ctx-copy-rel-path').style.display = isSingle ? 'flex' : 'none';

    // Smart Batch Rename
    const ctxBatch = document.getElementById('ctx-batch-rename');
    if (ctxBatch) {
        ctxBatch.style.display = count > 0 ? 'flex' : 'none';
        const shortcut = document.getElementById('ctx-batch-shortcut');
        if (shortcut) shortcut.textContent = isMac ? '⌘⇧R' : 'Ctrl+Shift+R';
    }

    // Compress to .zip
    const ctxCompress = document.getElementById('ctx-compress');
    if (ctxCompress) {
        ctxCompress.style.display = count > 0 ? 'flex' : 'none';
        const label = document.getElementById('ctx-compress-label');
        if (label) {
            if (count === 1) {
                label.textContent = 'Compress "' + (selectedItem ? selectedItem.name : name) + '.zip"';
            } else {
                label.textContent = 'Compress ' + count + ' items to .zip';
            }
        }
    }

    // Archive Extract (if single archive file selected)
    const targetItem = selectedItem || (selectedItems.length === 1 ? selectedItems[0] : null);
    const isArchive = isSingle && targetItem && isArchiveFileName(targetItem.name);
    const ctxExtractHere = document.getElementById('ctx-extract-here');
    if (ctxExtractHere) ctxExtractHere.style.display = isArchive ? 'flex' : 'none';

    const ctxExtractTo = document.getElementById('ctx-extract-to');
    if (ctxExtractTo) {
        ctxExtractTo.style.display = isArchive ? 'flex' : 'none';
        const label = document.getElementById('ctx-extract-to-label');
        if (label && targetItem) {
            const baseFolder = targetItem.name.replace(/\.(zip|tar\.gz|tgz|tar|gz)$/i, '');
            label.textContent = 'Extract to ' + baseFolder + '/';
        }
    }

    // Show Diff if modified or staged
    const gitCode = currentGitStatuses ? currentGitStatuses[name] : null;
    const canDiff = gitCode && (gitCode === 'M' || gitCode === 'A');
    document.getElementById('ctx-diff').style.display = (canDiff && !isDir && isSingle) ? 'flex' : 'none';

    // Show Compare if exactly 2 items selected
    const ctxCompareTwo = document.getElementById('ctx-compare-two');
    if (ctxCompareTwo) ctxCompareTwo.style.display = (count === 2) ? 'flex' : 'none';

    // Pin/Unpin folder option
    const pinItem = document.getElementById('ctx-pin-folder');
    if (pinItem) {
        pinItem.style.display = (isDir && isSingle) ? 'flex' : 'none';
        const sep = isWindows ? '\\' : '/';
        const fullItemPath = currentPath.endsWith(sep) ? currentPath + name : currentPath + sep + name;
        const isPinned = userBookmarks.some(function(b) { return b.path === fullItemPath; });
        document.getElementById('ctx-pin-label').textContent = isPinned ? 'Unpin from Favorites' : 'Pin to Favorites';
        document.getElementById('ctx-pin-icon').textContent = isPinned ? '☆' : '⭐';
    }

    // Working Directory & IDE Workspace options
    const ctxSetWorkingDir = document.getElementById('ctx-set-working-dir');
    const ctxOpenIdeWorkspace = document.getElementById('ctx-open-ide-workspace');
    const ctxAddToIdeWorkspace = document.getElementById('ctx-add-to-ide-workspace');
    const sep = isWindows ? '\\' : '/';
    const fullItemPath = selectedItem ? (selectedItem.path || (currentPath.endsWith(sep) ? currentPath + name : currentPath + sep + name)) : currentPath;

    if (ctxSetWorkingDir) {
        ctxSetWorkingDir.style.display = (isDir && isSingle) ? 'flex' : 'none';
        const label = document.getElementById('ctx-set-working-dir-label');
        if (label) {
            label.textContent = (fullItemPath === activeWorkingDirectory) ? 'Working Directory (Active)' : 'Set as Working Directory';
        }
    }
    if (ctxOpenIdeWorkspace) {
        ctxOpenIdeWorkspace.style.display = (isDir && isSingle) ? 'flex' : 'none';
        const label = document.getElementById('ctx-open-ide-workspace-label');
        if (label) {
            label.textContent = 'Open as ' + detectedIdeName + ' Workspace';
        }
    }
    if (ctxAddToIdeWorkspace) {
        ctxAddToIdeWorkspace.style.display = (isDir && isSingle) ? 'flex' : 'none';
        const label = document.getElementById('ctx-add-to-ide-workspace-label');
        if (label) {
            label.textContent = 'Add to ' + detectedIdeName + ' Workspace';
        }
    }

    showContextMenuAt(e.clientX, e.clientY);
}

function handleBackgroundContextMenu(e) {
    e.preventDefault();
    selectedItem = null;
    selectedItems = [];
    lastSelectedName = null;
    updateSelectionState();
    syncItemSelectionDOM();

    const menu = document.getElementById('context-menu');
    const newTabItem = document.getElementById('ctx-new-tab');
    if (newTabItem) newTabItem.style.display = 'flex';
    const openTabItem = document.getElementById('ctx-open-new-tab');
    if (openTabItem) openTabItem.style.display = 'none';
    document.getElementById('ctx-open').style.display = 'none';
    const openSystemItem = document.getElementById('ctx-open-system');
    if (openSystemItem) openSystemItem.style.display = 'none';
    const runScriptItem = document.getElementById('ctx-run-script');
    if (runScriptItem) runScriptItem.style.display = 'none';
    document.getElementById('ctx-diff').style.display = 'none';
    document.getElementById('ctx-quicklook').style.display = 'none';
    document.getElementById('ctx-rename').style.display = 'none';
    const ctxBatch = document.getElementById('ctx-batch-rename');
    if (ctxBatch) ctxBatch.style.display = 'none';
    const ctxCompress = document.getElementById('ctx-compress');
    if (ctxCompress) ctxCompress.style.display = 'none';
    const ctxExtractHere = document.getElementById('ctx-extract-here');
    if (ctxExtractHere) ctxExtractHere.style.display = 'none';
    const ctxExtractTo = document.getElementById('ctx-extract-to');
    if (ctxExtractTo) ctxExtractTo.style.display = 'none';
    document.getElementById('ctx-copy').style.display = 'none';
    document.getElementById('ctx-cut').style.display = 'none';
    document.getElementById('ctx-delete').style.display = 'none';
    document.getElementById('ctx-properties').style.display = 'none';
    document.getElementById('ctx-terminal-item').style.display = 'flex';
    document.getElementById('ctx-reveal-item').style.display = 'flex';
    document.getElementById('ctx-reveal-label').textContent = isWindows ? 'Reveal in File Explorer' : 'Reveal in Finder';
    document.getElementById('ctx-copy-path').style.display = 'flex';
    document.getElementById('ctx-copy-rel-path').style.display = 'none';

    const pinItem = document.getElementById('ctx-pin-folder');
    if (pinItem) {
        pinItem.style.display = 'flex';
        const isPinned = userBookmarks.some(function(b) { return b.path === currentPath; });
        document.getElementById('ctx-pin-label').textContent = isPinned ? 'Unpin from Favorites' : 'Pin to Favorites';
        document.getElementById('ctx-pin-icon').textContent = isPinned ? '☆' : '⭐';
    }

    const ctxSetWorkingDir = document.getElementById('ctx-set-working-dir');
    const ctxOpenIdeWorkspace = document.getElementById('ctx-open-ide-workspace');
    const ctxAddToIdeWorkspace = document.getElementById('ctx-add-to-ide-workspace');

    if (ctxSetWorkingDir) {
        ctxSetWorkingDir.style.display = 'flex';
        const label = document.getElementById('ctx-set-working-dir-label');
        if (label) {
            label.textContent = (currentPath === activeWorkingDirectory) ? 'Current Directory (Working Dir Active)' : 'Set Current as Working Directory';
        }
    }
    if (ctxOpenIdeWorkspace) {
        ctxOpenIdeWorkspace.style.display = 'flex';
        const label = document.getElementById('ctx-open-ide-workspace-label');
        if (label) {
            label.textContent = 'Open Current as ' + detectedIdeName + ' Workspace';
        }
    }
    if (ctxAddToIdeWorkspace) {
        ctxAddToIdeWorkspace.style.display = 'flex';
        const label = document.getElementById('ctx-add-to-ide-workspace-label');
        if (label) {
            label.textContent = 'Add Current to ' + detectedIdeName + ' Workspace';
        }
    }

    showContextMenuAt(e.clientX, e.clientY);
}

function showContextMenuAt(x, y) {
    const menu = document.getElementById('context-menu');
    menu.style.display = 'flex';
    const maxX = window.innerWidth - menu.offsetWidth - 10;
    const maxY = window.innerHeight - menu.offsetHeight - 10;
    menu.style.left = Math.min(x, maxX) + 'px';
    menu.style.top = Math.min(y, maxY) + 'px';
}

function hideContextMenu() {
    const ctxMenu = document.getElementById('context-menu');
    if (ctxMenu) ctxMenu.style.display = 'none';
    const tabMenu = document.getElementById('tab-context-menu');
    if (tabMenu) tabMenu.style.display = 'none';
}

// ══════════════════════════════════════════════════════════
// 📂 SYSTEM ROOTS & DROPDOWN
// ══════════════════════════════════════════════════════════
async function fetchRoots() {
    try {
        const res = await fetch('/api/files/roots');
        if (res.ok) {
            systemRoots = await res.json();
            renderQuickAccessDrives();
        }
    } catch (e) {
        console.error('Failed to load roots', e);
    }
}

function togglePathDropdown(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    const dropdown = document.getElementById('path-dropdown');
    const backdrop = document.getElementById('path-dropdown-backdrop');
    if (dropdown.style.display === 'none' || !dropdown.style.display) {
        renderPathDropdown();
        dropdown.style.display = 'flex';
        if (backdrop) backdrop.style.display = 'block';
    } else {
        closePathDropdown(e);
    }
}

function closePathDropdown(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    const dropdown = document.getElementById('path-dropdown');
    const backdrop = document.getElementById('path-dropdown-backdrop');
    if (dropdown) dropdown.style.display = 'none';
    if (backdrop) backdrop.style.display = 'none';
}

function renderPathDropdown() {
    const dropdown = document.getElementById('path-dropdown');
    let html = '';

    if (userBookmarks && userBookmarks.length > 0) {
        html += '<div class="dropdown-section-title">⭐ Pinned Favorites (' + userBookmarks.length + ')</div>';
        for (let i = 0; i < userBookmarks.length; i++) {
            const b = userBookmarks[i];
            const isCurrent = (b.path === currentPath);
            html += '<div class="dropdown-item' + (isCurrent ? ' dropdown-item-current' : '') + '" style="' + (isCurrent ? 'font-weight: 600; color: #74b9ff;' : '') + '" onclick="selectDropdownPath(\'' + escapePath(b.path) + '\', event)">' +
                    '<i>' + (b.icon || '📁') + '</i>' +
                    '<span>' + escapeHtml(b.name) + (isCurrent ? ' (Current)' : '') + '</span>' +
                    '<span class="item-sub">' + escapeHtml(b.path) + '</span>' +
                    '</div>';
        }
        html += '<div class="dropdown-divider"></div>';
    }

    if (systemRoots && systemRoots.length > 0) {
        html += '<div class="dropdown-section-title">Drives & System Roots</div>';
        for (let i = 0; i < systemRoots.length; i++) {
            const root = systemRoots[i];
            const icon = root.type === 'Drive' ? '💻' : root.type === 'Home' ? '🏠' : root.type === 'Desktop' ? '🖥️' : '📁';
            html += '<div class="dropdown-item" onclick="selectDropdownPath(\'' + escapePath(root.path) + '\', event)">' +
                    '<i>' + icon + '</i>' +
                    '<span>' + escapeHtml(root.name) + '</span>' +
                    '<span class="item-sub">' + escapeHtml(root.path) + '</span>' +
                    '</div>';
        }
    }

    const sep = isWindows ? '\\' : '/';
    if (currentPath && currentPath !== '.') {
        const parts = currentPath.split(sep).filter(function(p) { return p !== ''; });
        if (parts.length > 0) {
            html += '<div class="dropdown-divider"></div>';
            html += '<div class="dropdown-section-title">Folder Hierarchy</div>';

            const rootPath = isWindows ? (currentPath.slice(0, 3)) : '/';
            html += '<div class="dropdown-item" onclick="selectDropdownPath(\'' + escapePath(rootPath) + '\', event)">' +
                    '<i>📁</i>' +
                    '<span>' + (isWindows ? rootPath : '/ (Root)') + '</span>' +
                    '<span class="item-sub">' + escapeHtml(rootPath) + '</span>' +
                    '</div>';

            let accum = isWindows ? rootPath : '';
            for (let i = 0; i < parts.length; i++) {
                if (isWindows && i === 0 && parts[0].endsWith(':')) continue;
                accum = isWindows ? (accum.endsWith('\\') ? accum + parts[i] : accum + '\\' + parts[i]) : accum + '/' + parts[i];
                const isCurrent = (accum === currentPath);
                html += '<div class="dropdown-item" style="padding-left: ' + ((i + 2) * 12) + 'px; ' + (isCurrent ? 'font-weight: 600; color: #74b9ff;' : '') + '" onclick="selectDropdownPath(\'' + escapePath(accum) + '\', event)">' +
                        '<i>📂</i>' +
                        '<span>' + escapeHtml(parts[i]) + (isCurrent ? ' (Current)' : '') + '</span>' +
                        '<span class="item-sub">' + escapeHtml(accum) + '</span>' +
                        '</div>';
            }
        }
    }

    dropdown.innerHTML = html;
}

function selectDropdownPath(targetPath, e) {
    if (e && e.stopPropagation) e.stopPropagation();
    closePathDropdown();
    navigateTo(targetPath);
}

// ══════════════════════════════════════════════════════════

// 🏷️ SMART BATCH RENAMER
// ══════════════════════════════════════════════════════════
function switchBatchTab(tabName) {
    activeBatchTab = tabName;
    document.querySelectorAll('.batch-tab-btn').forEach(function(btn) {
        if (btn.getAttribute('data-tab') === tabName) btn.classList.add('active');
        else btn.classList.remove('active');
    });
    const panels = ['replace', 'text', 'number', 'case', 'ext'];
    for (let i = 0; i < panels.length; i++) {
        const p = document.getElementById('batch-panel-' + panels[i]);
        if (p) p.style.display = panels[i] === tabName ? 'flex' : 'none';
    }
    updateBatchPreview();
}

function showBatchRenameModal() {
    hideContextMenu();
    if (selectedItems.length === 0) {
        if (selectedItem) selectedItems = [selectedItem];
        else {
            showToast('Please select files or folders to batch rename', '⚠️');
            return;
        }
    }
    const countPill = document.getElementById('batch-item-count');
    if (countPill) countPill.textContent = selectedItems.length + ' item' + (selectedItems.length === 1 ? '' : 's');

    switchBatchTab(activeBatchTab || 'replace');
    const modal = document.getElementById('modal-batch-rename');
    if (modal) modal.style.display = 'flex';
    updateBatchPreview();
}

function transformCase(str, mode) {
    if (!str) return '';
    switch (mode) {
        case 'lower':
            return str.toLowerCase();
        case 'upper':
            return str.toUpperCase();
        case 'title':
            return str.replace(/\b[a-z]/gi, function(c) { return c.toUpperCase(); });
        case 'camel': {
            const words = str.split(/[\s_\-]+/).filter(Boolean);
            if (words.length === 0) return str;
            return words[0].toLowerCase() + words.slice(1).map(function(w) {
                return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
            }).join('');
        }
        case 'kebab': {
            const words = str.split(/[\s_\-]+/).filter(Boolean);
            return words.map(function(w) { return w.toLowerCase(); }).join('-');
        }
        case 'snake': {
            const words = str.split(/[\s_\-]+/).filter(Boolean);
            return words.map(function(w) { return w.toLowerCase(); }).join('_');
        }
        default:
            return str;
    }
}

function batchExtLowercase() {
    const input = document.getElementById('batch-ext-input');
    if (input) input.value = '';
    switchBatchTab('case');
    const caseSelect = document.getElementById('batch-case-mode');
    if (caseSelect) caseSelect.value = 'lower';
    const caseExt = document.getElementById('batch-case-ext');
    if (caseExt) caseExt.checked = true;
    updateBatchPreview();
}

function calculateBatchNewName(oldName, isDir, index, total) {
    let base = oldName;
    let ext = '';
    if (!isDir) {
        const dotIdx = oldName.lastIndexOf('.');
        if (dotIdx > 0) {
            base = oldName.substring(0, dotIdx);
            ext = oldName.substring(dotIdx);
        }
    }

    switch (activeBatchTab) {
        case 'replace': {
            const findText = document.getElementById('batch-find-text').value;
            const replaceText = document.getElementById('batch-replace-text').value || '';
            const matchCase = document.getElementById('batch-find-case').checked;
            const isRegex = document.getElementById('batch-find-regex').checked;
            if (!findText) return oldName;
            try {
                let newBase;
                if (isRegex) {
                    const re = new RegExp(findText, matchCase ? 'g' : 'gi');
                    newBase = base.replace(re, replaceText);
                } else {
                    if (matchCase) {
                        newBase = base.split(findText).join(replaceText);
                    } else {
                        const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const re = new RegExp(escaped, 'gi');
                        newBase = base.replace(re, replaceText);
                    }
                }
                return newBase + ext;
            } catch {
                return oldName;
            }
        }
        case 'text': {
            const prefix = document.getElementById('batch-prefix-text').value || '';
            const suffix = document.getElementById('batch-suffix-text').value || '';
            return prefix + base + suffix + ext;
        }
        case 'number': {
            const start = parseInt(document.getElementById('batch-num-start').value, 10) || 1;
            const step = parseInt(document.getElementById('batch-num-step').value, 10) || 1;
            const padding = parseInt(document.getElementById('batch-num-padding').value, 10) || 1;
            const pos = document.getElementById('batch-num-pos').value;
            const sep = document.getElementById('batch-num-sep').value || '';

            const numVal = start + (index * step);
            let numStr = String(numVal);
            while (numStr.length < padding) {
                numStr = '0' + numStr;
            }

            if (pos === 'prefix') {
                return numStr + sep + base + ext;
            } else if (pos === 'suffix') {
                return base + sep + numStr + ext;
            } else {
                return numStr + ext;
            }
        }
        case 'case': {
            const mode = document.getElementById('batch-case-mode').value;
            const applyExt = document.getElementById('batch-case-ext').checked;
            const newBase = transformCase(base, mode);
            const newExt = (applyExt && ext) ? (ext.startsWith('.') ? '.' + transformCase(ext.substring(1), mode) : transformCase(ext, mode)) : ext;
            return newBase + newExt;
        }
        case 'ext': {
            if (isDir) return oldName;
            let newExt = document.getElementById('batch-ext-input').value.trim();
            if (newExt && !newExt.startsWith('.')) newExt = '.' + newExt;
            return base + newExt;
        }
        default:
            return oldName;
    }
}

function updateBatchPreview() {
    const tableBody = document.getElementById('batch-preview-table-body');
    if (!tableBody) return;

    batchGeneratedNames = [];
    const newNamesSet = new Map();
    let changedCount = 0;
    let hasConflict = false;

    const existingOtherNames = new Set(
        currentItems
            .filter(function(ci) { return !selectedItems.some(function(si) { return si.name === ci.name; }); })
            .map(function(ci) { return ci.name.toLowerCase(); })
    );

    for (let i = 0; i < selectedItems.length; i++) {
        const item = selectedItems[i];
        const newName = calculateBatchNewName(item.name, item.type === 'Directory', i, selectedItems.length);
        const isChanged = (newName !== item.name);
        if (isChanged) changedCount++;

        let conflict = null;
        const lowerNew = newName.toLowerCase();
        if (!newName || newName.includes('/') || newName.includes('\\')) {
            conflict = 'Invalid Name';
        } else if (existingOtherNames.has(lowerNew)) {
            conflict = 'File Exists';
        } else if (newNamesSet.has(lowerNew)) {
            conflict = 'Duplicate';
        }

        newNamesSet.set(lowerNew, true);
        if (conflict) hasConflict = true;

        batchGeneratedNames.push({
            oldName: item.name,
            newName: newName,
            isDir: item.type === 'Directory',
            isChanged: isChanged,
            conflict: conflict
        });
    }

    let rowsHtml = '';
    for (let i = 0; i < batchGeneratedNames.length; i++) {
        const entry = batchGeneratedNames[i];
        let badgeClass = 'unchanged';
        let badgeText = 'Unchanged';
        if (entry.conflict) {
            badgeClass = 'conflict';
            badgeText = '⚠️ ' + entry.conflict;
        } else if (entry.isChanged) {
            badgeClass = 'changed';
            badgeText = '✓ Changed';
        }

        rowsHtml += '<tr>' +
                    '<td title="' + escapeHtml(entry.oldName) + '">' + (entry.isDir ? '📁 ' : '📄 ') + escapeHtml(entry.oldName) + '</td>' +
                    '<td title="' + escapeHtml(entry.newName) + '" style="' + (entry.isChanged ? 'color: #2ecc71; font-weight: 500;' : 'color: var(--text-muted);') + '">' + escapeHtml(entry.newName) + '</td>' +
                    '<td style="text-align: center;"><span class="batch-status-badge ' + badgeClass + '">' + badgeText + '</span></td>' +
                    '</tr>';
    }
    tableBody.innerHTML = rowsHtml;

    const statusElem = document.getElementById('batch-preview-status');
    if (statusElem) {
        statusElem.textContent = changedCount + ' of ' + selectedItems.length + ' will be renamed';
    }

    const alertElem = document.getElementById('batch-conflict-alert');
    if (alertElem) {
        alertElem.style.display = hasConflict ? 'block' : 'none';
    }

    const applyBtn = document.getElementById('btn-apply-batch-rename');
    if (applyBtn) {
        applyBtn.disabled = hasConflict || changedCount === 0;
        applyBtn.textContent = 'Apply Rename (' + changedCount + ')';
    }
}

async function submitBatchRename() {
    const renamesToApply = batchGeneratedNames.filter(function(b) {
        return b.isChanged && !b.conflict && b.newName && b.newName !== b.oldName;
    });
    if (renamesToApply.length === 0) {
        hideModals();
        showToast('No file names were changed', 'ℹ️');
        return;
    }

    hideModals();
    showToast('Renaming ' + renamesToApply.length + ' item(s)...', '⏳');
    try {
        const res = await fetch('/api/files/batch-rename', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                currentPath: currentPath,
                renames: renamesToApply.map(function(r) { return { oldName: r.oldName, newName: r.newName }; })
            })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            const renamedCount = data.renamedCount !== undefined ? data.renamedCount : (data.count !== undefined ? data.count : 0);
            showToast('Renamed ' + renamedCount + ' item(s) successfully', '🏷️');
            selectedItem = null;
            selectedItems = [];
            lastSelectedName = null;
            loadFiles(currentPath);
        } else {
            showToast('Batch rename failed: ' + (data.error || 'Unknown error'), '❌');
        }
    } catch (err) {
        console.error(err);
        showToast('Error executing batch rename', '❌');
    }
}

// ══════════════════════════════════════════════════════════

// 🗜️ ZIP / UNZIP ARCHIVE MANAGEMENT
// ══════════════════════════════════════════════════════════
function handleCompressSelected() {
    hideContextMenu();
    const items = selectedItems.length > 0 ? selectedItems.slice() : (selectedItem ? [selectedItem] : []);
    if (items.length === 0) {
        showToast('Please select files or folders to compress', '⚠️');
        return;
    }

    let defaultName = 'archive.zip';
    if (items.length === 1) {
        defaultName = items[0].name.replace(/[\\/]+$/, '') + '.zip';
    } else {
        const folderName = getTabTitleForPath(currentPath);
        defaultName = (folderName && folderName !== 'Folder' && folderName !== 'Root' ? folderName + '_archive.zip' : 'archive.zip');
    }

    const input = document.getElementById('input-compress-name');
    if (input) input.value = defaultName;
    const desc = document.getElementById('compress-prompt-desc');
    if (desc) desc.textContent = 'Compress ' + items.length + ' item' + (items.length === 1 ? '' : 's') + ' into:';

    const modal = document.getElementById('modal-compress');
    if (modal) modal.style.display = 'flex';
    setTimeout(function() {
        if (input) {
            input.focus();
            const dotIdx = input.value.lastIndexOf('.');
            if (dotIdx > 0) input.setSelectionRange(0, dotIdx);
            else input.select();
        }
    }, 50);
}

async function submitCompress() {
    const input = document.getElementById('input-compress-name');
    let archiveName = input ? input.value.trim() : '';
    if (!archiveName) archiveName = 'archive.zip';
    if (!archiveName.toLowerCase().endsWith('.zip')) archiveName += '.zip';

    hideModals();
    const rawItems = selectedItems.length > 0 ? selectedItems.slice() : (selectedItem ? [selectedItem] : []);
    const items = rawItems.map(function(i) {
        return typeof i === 'string' ? i : (i ? i.name : '');
    }).filter(Boolean);

    if (items.length === 0) {
        showToast('No valid items selected to compress', '⚠️');
        return;
    }

    showToast('Compressing into "' + archiveName + '"...', '⏳');
    try {
        const res = await fetch('/api/files/compress', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                currentPath: currentPath,
                folder: currentPath,
                items: items,
                archiveName: archiveName
            })
        });
        let data = null;
        try { data = await res.json(); } catch {}
        if (res.ok && data && data.success) {
            showToast('Created archive "' + (data.archiveName || archiveName) + '"', '🗜️');
            loadFiles(currentPath);
        } else {
            const errDetail = (data && (data.error || data.detail || data.title)) || (res.statusText ? 'HTTP ' + res.status + ' (' + res.statusText + ')' : 'Server error');
            showToast(errDetail.startsWith('Compression failed') ? errDetail : 'Compression failed: ' + errDetail, '❌');
        }
    } catch (err) {
        console.error(err);
        showToast('Error creating archive: ' + (err.message || 'Network error'), '❌');
    }
}

async function handleExtractSelected(intoSubfolder) {
    hideContextMenu();
    const targetItem = selectedItem || (selectedItems.length === 1 ? selectedItems[0] : null);
    if (!targetItem || !isArchiveFileName(targetItem.name)) {
        showToast('Please select a valid archive (.zip, .tar.gz, etc.) to extract', '⚠️');
        return;
    }

    const sep = isWindows ? '\\' : '/';
    const archiveFullPath = targetItem.path || (currentPath.endsWith(sep) ? currentPath + targetItem.name : currentPath + sep + targetItem.name);
    let destinationFolder = undefined;
    if (intoSubfolder) {
        const baseName = targetItem.name.replace(/\.(zip|tar\.gz|tgz|tar|gz)$/i, '');
        destinationFolder = currentPath.endsWith(sep) ? currentPath + baseName : currentPath + sep + baseName;
    }

    showToast('Extracting "' + targetItem.name + '"...', '⏳');
    try {
        const res = await fetch('/api/files/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                archivePath: archiveFullPath,
                destinationDir: destinationFolder,
                folder: currentPath,
                archiveName: targetItem.name,
                destinationFolder: destinationFolder
            })
        });
        let data = null;
        try { data = await res.json(); } catch {}
        if (res.ok && data && data.success) {
            showToast('Archive extracted successfully' + (intoSubfolder ? ' to ' + targetItem.name.replace(/\.(zip|tar\.gz|tgz|tar|gz)$/i, '') + '/' : ''), '📦');
            loadFiles(currentPath);
        } else {
            const errDetail = (data && (data.error || data.detail || data.title)) || (res.statusText ? 'HTTP ' + res.status + ' (' + res.statusText + ')' : 'Server error');
            showToast(errDetail.startsWith('Extraction failed') ? errDetail : 'Extraction failed: ' + errDetail, '❌');
        }
    } catch (err) {
        console.error(err);
        showToast('Error extracting archive: ' + (err.message || 'Network error'), '❌');
    }
}

// ══════════════════════════════════════════════════════════