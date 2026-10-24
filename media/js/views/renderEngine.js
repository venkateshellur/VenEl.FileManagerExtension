/**
 * VenEl File Manager - Render Engine
 * Virtualized chunked rendering (60 FPS), sorting, and quick filtering.
 */
// ══════════════════════════════════════════════════════════
// 📊 COLUMN SORTING (LIST VIEW)
// ══════════════════════════════════════════════════════════
function handleSort(field) {
    if (currentSort.field === field) {
        currentSort.asc = !currentSort.asc;
    } else {
        currentSort.field = field;
        currentSort.asc = true;
    }
    updateSortIndicators();
    applySortAndRender();
}

function updateSortIndicators() {
    const fields = ['name', 'modified', 'type', 'size'];
    fields.forEach(function(f) {
        const el = document.getElementById('sort-' + f + '-icon');
        if (el) {
            if (currentSort.field === f) {
                el.innerText = currentSort.asc ? '▲' : '▼';
            } else {
                el.innerText = '';
            }
        }
    });
    updateViewMenuChecks();
}

function applySortAndRender() {
    if (!currentItems) return;
    currentItems.sort(function(a, b) {
        const aIsDir = a.type === 'Directory';
        const bIsDir = b.type === 'Directory';
        // Directories always on top (like Explorer/Finder)
        if (aIsDir && !bIsDir) return -1;
        if (!aIsDir && bIsDir) return 1;

        let valA = a[currentSort.field] || '';
        let valB = b[currentSort.field] || '';

        if (currentSort.field === 'name') {
            return currentSort.asc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        } else if (currentSort.field === 'size') {
            return currentSort.asc ? (a.size - b.size) : (b.size - a.size);
        } else if (currentSort.field === 'modified') {
            const dateA = new Date(a.modified || 0).getTime();
            const dateB = new Date(b.modified || 0).getTime();
            return currentSort.asc ? (dateA - dateB) : (dateB - dateA);
        } else if (currentSort.field === 'type') {
            return currentSort.asc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        return 0;
    });
    updateQuickFilterCounts();
    applyFilterAndRender();
}


// ══════════════════════════════════════════════════════════
// 🏷️ QUICK FILTERING & ITEM CATEGORIZATION
// ══════════════════════════════════════════════════════════
let currentQuickFilter = 'all';

function getItemCategory(item) {
    if (item.type === 'Directory') return 'folders';
    const name = item.name || '';
    const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';

    // Code & Binaries
    const codeExts = ['cs', 'ts', 'js', 'jsx', 'tsx', 'py', 'json', 'html', 'css', 'scss', 'less', 'sql', 'sh', 'bash', 'zsh', 'xml', 'yaml', 'yml', 'c', 'cpp', 'h', 'hpp', 'java', 'go', 'rs', 'php', 'rb', 'swift', 'kt', 'dart', 'dll', 'exe', 'wasm', 'vue', 'svelte', 'toml', 'ini', 'config', 'env', 'properties'];
    if (codeExts.includes(ext) || name.startsWith('Dockerfile') || name.startsWith('.env') || name.startsWith('.git')) {
        return 'code';
    }

    // Documents
    const docExts = ['md', 'markdown', 'pdf', 'txt', 'log', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'ppt', 'pptx', 'rtf', 'odt', 'ods', 'odp'];
    if (docExts.includes(ext)) {
        return 'documents';
    }

    // Images & Media
    const mediaExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'tiff', 'mp4', 'mov', 'mkv', 'webm', 'mp3', 'wav', 'flac', 'm4a', 'ogg', 'aac'];
    if (mediaExts.includes(ext)) {
        return 'images';
    }

    // Archives
    const archiveExts = ['zip', 'tar', 'gz', 'tgz', 'rar', '7z', 'bz2', 'xz', 'iso', 'dmg'];
    if (archiveExts.includes(ext)) {
        return 'archives';
    }

    return 'other';
}

function updateQuickFilterCounts() {
    const counts = {
        all: 0,
        folders: 0,
        code: 0,
        documents: 0,
        images: 0,
        archives: 0
    };

    if (currentItems && currentItems.length > 0) {
        for (let i = 0; i < currentItems.length; i++) {
            const item = currentItems[i];
            const isHidden = (item.name && item.name.startsWith('.')) || item.isHidden;
            if (isHidden && !showHiddenFiles) continue;

            counts.all++;
            const cat = getItemCategory(item);
            if (counts[cat] !== undefined) {
                counts[cat]++;
            }
        }
    }

    ['all', 'folders', 'code', 'documents', 'images', 'archives'].forEach(function(cat) {
        const countEl = document.getElementById('count-' + cat);
        const chipEl = document.getElementById('filter-chip-' + cat);
        if (countEl) countEl.textContent = counts[cat] || 0;
        if (chipEl) {
            if ((counts[cat] || 0) === 0 && cat !== 'all') {
                chipEl.classList.add('chip-empty');
            } else {
                chipEl.classList.remove('chip-empty');
            }
        }
    });
}

function setQuickFilter(cat) {
    currentQuickFilter = cat || 'all';
    ['all', 'folders', 'code', 'documents', 'images', 'archives'].forEach(function(c) {
        const chip = document.getElementById('filter-chip-' + c);
        if (chip) {
            if (c === currentQuickFilter) chip.classList.add('active');
            else chip.classList.remove('active');
        }
    });
    applyFilterAndRender();
}

function applyFilterAndRender() {
    if (!currentItems) {
        renderItems([]);
        return;
    }

    const q = document.getElementById('search') ? document.getElementById('search').value.toLowerCase().trim() : '';

    const filtered = currentItems.filter(function(item) {
        // 1. Hidden Files Filter
        const isHidden = (item.name && item.name.startsWith('.')) || item.isHidden;
        if (isHidden && !showHiddenFiles && !isAgentSearchResultsActive) return false;

        // 2. Quick Filter Category
        if (currentQuickFilter !== 'all') {
            const cat = getItemCategory(item);
            if (cat !== currentQuickFilter) return false;
        }

        // 3. Search Query Filter (Only apply client-side filter in standard folder view; Agent Search results are already matched by system engine)
        if (q && !isAgentSearchResultsActive) {
            const matchName = item.name && item.name.toLowerCase().includes(q);
            const matchPath = item.path && item.path.toLowerCase().includes(q);
            if (!matchName && !matchPath) return false;
        }

        return true;
    });

    renderItems(filtered);

    const countElem = document.getElementById('status-items-count');
    if (countElem) {
        if (filtered.length !== currentItems.length) {
            countElem.innerText = filtered.length + ' of ' + currentItems.length + ' items' + (q ? ' (Esc to clear)' : '');
        } else {
            countElem.innerText = filtered.length + ' item' + (filtered.length === 1 ? '' : 's');
        }
    }
}

function handleSearch() {
    applyFilterAndRender();
}


// ══════════════════════════════════════════════════════════
// ⚡ VIRTUAL CHUNKED RENDERING ENGINE (60 FPS SCALING)
// ══════════════════════════════════════════════════════════
const RENDER_CHUNK_SIZE = 80;
let renderedChunkCount = 0;
let chunkObserver = null;
let activeRenderItems = [];

function renderItemHtml(item) {
    const isDir = item.type === 'Directory';
    const isHidden = (item.name && item.name.startsWith('.')) || item.isHidden;
    const visual = getFileVisual(item.name, isDir);
    let className = isDir ? 'folder' : 'file';
    const sizeText = !isDir ? formatBytes(item.size) : '--';
    const modDate = item.modified ? formatDate(item.modified) : '';
    const isSelected = selectedItems.some(function(si) { return si.name === item.name; }) || (selectedItem && selectedItem.name === item.name);
    const isCut = clipboard && clipboard.action === 'cut' && ((clipboard.items && clipboard.items.some(function(ci) { return ci.name === item.name; })) || clipboard.name === item.name);

    const sep = isWindows ? '\\' : '/';
    const fullItemPath = (item.isSearchResult && item.path) ? item.path : (currentPath.endsWith(sep) ? currentPath + item.name : currentPath + sep + item.name);

    let iconHtml = visual.svg || ('<i>' + visual.icon + '</i>');
    if (visual.isImage) {
        iconHtml = '<img src="/api/files/raw?path=' + encodeURIComponent(fullItemPath) + '" class="item-thumb" onerror="this.onerror=null; this.outerHTML=\'<i>🖼️</i>\';"/>';
    }

    let locationHtml = '';
    if (item.isSearchResult && item.directory) {
        const displayDir = formatLocationDisplay(item.directory);
        locationHtml = '<span class="item-search-location" onclick="event.stopPropagation(); jumpToSearchResult(\'' + escapePath(item.directory) + '\', \'' + escapePath(item.name) + '\')" title="Jump to ' + escapeHtml(item.directory) + '">📂 ' + escapeHtml(displayDir) + '</span>';
    }

    let gitBadgeHtml = '';
    let gitCardBadgeHtml = '';
    let gitClass = '';
    let gitCode = null;
    if (currentGitStatuses && currentGitStatuses[item.name]) {
        gitCode = currentGitStatuses[item.name];
        const codeLower = gitCode.toLowerCase();
        const displayCode = gitCode === '?' ? 'U' : gitCode;
        const title = gitCode === 'M' ? 'Modified in Git' : (gitCode === 'U' || gitCode === '?' ? 'Untracked in Git' : (gitCode === 'A' ? 'Added / Staged in Git' : (gitCode === 'D' ? 'Deleted in Git' : (gitCode === 'R' ? 'Renamed in Git' : 'Changed in Git'))));
        gitClass = ' git-item git-status-' + codeLower;
        gitBadgeHtml = '<span class="git-badge git-' + codeLower + '" title="' + title + '">' + displayCode + '</span>';
        gitCardBadgeHtml = '<span class="git-card-pill git-pill-' + codeLower + '" title="' + title + '">' + displayCode + '</span>';
    }

    let dragAttr = 'draggable="true" ondragstart="handleItemDragStart(event, \'' + escapePath(item.name) + '\', ' + isDir + ')" ondragend="handleItemDragEnd(event)"';
    if (isDir) {
        dragAttr += ' ondragover="handleFolderDragOver(event, \'' + escapePath(item.name) + '\')" ondragleave="handleFolderDragLeave(event)" ondrop="handleFolderDrop(event, \'' + escapePath(item.name) + '\')"';
    }

    if (item.isSearchResult) {
        className += ' is-search-result';
    }

    return '<div class="item ' + className + gitClass + (isSelected ? ' selected' : '') + (isCut ? ' cut-item' : '') + (isHidden ? ' is-hidden' : '') + '" ' +
            dragAttr + ' ' +
            'data-name="' + escapeHtml(item.name) + '" ' +
            'data-path="' + escapeHtml(fullItemPath) + '" ' +
            (gitCode ? 'data-git-status="' + escapeHtml(gitCode) + '" ' : '') +
            'onmouseenter="handleItemHoverEnter(event, this)" ' +
            'onmouseleave="handleItemHoverLeave(event, this)" ' +
            'onmousemove="handleItemHoverMove(event, this)" ' +
            'onclick="handleItemClick(event, \'' + escapePath(item.name) + '\', ' + isDir + ')" ' +
            'onauxclick="handleItemAuxClick(event, \'' + escapePath(item.name) + '\', ' + isDir + ')" ' +
            'ondblclick="handleDoubleClick(\'' + escapePath(item.name) + '\', ' + isDir + ')" ' +
            'oncontextmenu="handleItemContextMenu(event, \'' + escapePath(item.name) + '\', ' + isDir + ')">' +
            gitCardBadgeHtml +
            '<div class="item-icon-wrapper">' + iconHtml + (visual.badge ? '<span class="item-badge">' + visual.badge + '</span>' : '') + '</div>' +
            '<div class="item-info-col">' +
            '<div class="item-name-row">' +
            '<span class="item-name" title="' + escapeHtml(item.name) + '">' + escapeHtml(item.name) + '</span>' +
            gitBadgeHtml +
            '</div>' +
            locationHtml +
            '</div>' +
            '<span class="item-modified">' + modDate + '</span>' +
            '<span class="item-type">' + visual.typeLabel + '</span>' +
            '<span class="item-size">' + sizeText + '</span>' +
            '</div>';
}

function renderItems(items) {
    displayedItems = items || [];
    activeRenderItems = displayedItems;
    clearTypeAhead();

    const container = document.getElementById('files');
    if (!container) return;

    if (chunkObserver) {
        chunkObserver.disconnect();
    }

    if (!activeRenderItems || activeRenderItems.length === 0) {
        const searchVal = document.getElementById('search') ? document.getElementById('search').value.trim() : '';
        const emptyMsg = isAgentSearchResultsActive && searchVal
            ? '🤖 No matches found on this machine for "<strong>' + escapeHtml(searchVal) + '</strong>"'
            : 'No items match this filter or folder is empty';
        container.innerHTML = '<div style="grid-column: 1 / -1; padding: 40px; text-align: center; color: var(--text-muted); font-size: 13px;">' + emptyMsg + '</div>';
        updateSelectionState();
        const statusEl = document.getElementById('status-items-count');
        if (statusEl) statusEl.innerText = '0 items';
        return;
    }

    // Fast synchronous render of the first chunk (instant display in <2ms)
    const firstChunkEnd = Math.min(activeRenderItems.length, RENDER_CHUNK_SIZE);
    let html = '';
    for (let i = 0; i < firstChunkEnd; i++) {
        html += renderItemHtml(activeRenderItems[i]);
    }
    renderedChunkCount = firstChunkEnd;

    if (renderedChunkCount < activeRenderItems.length) {
        html += '<div id="files-sentinel" class="files-sentinel"><span>⚡ Loading more items (' + renderedChunkCount + '/' + activeRenderItems.length + ')...</span></div>';
    }

    container.innerHTML = html;
    updateSelectionState();

    const statusEl = document.getElementById('status-items-count');
    if (statusEl) {
        statusEl.innerText = activeRenderItems.length + ' item' + (activeRenderItems.length === 1 ? '' : 's');
    }

    if (renderedChunkCount < activeRenderItems.length) {
        setupChunkSentinel();
    }
}

function setupChunkSentinel() {
    const sentinel = document.getElementById('files-sentinel');
    if (!sentinel) return;

    if (!chunkObserver) {
        const rootContainer = document.getElementById('file-list-container');
        chunkObserver = new IntersectionObserver(function(entries) {
            if (entries[0] && entries[0].isIntersecting) {
                renderNextChunk();
            }
        }, {
            root: rootContainer,
            rootMargin: '400px'
        });
    }
    chunkObserver.observe(sentinel);
}

function renderNextChunk() {
    if (renderedChunkCount >= activeRenderItems.length) {
        const sentinel = document.getElementById('files-sentinel');
        if (sentinel) sentinel.remove();
        if (chunkObserver) chunkObserver.disconnect();
        return;
    }

    const nextEnd = Math.min(activeRenderItems.length, renderedChunkCount + RENDER_CHUNK_SIZE);
    let chunkHtml = '';
    for (let i = renderedChunkCount; i < nextEnd; i++) {
        chunkHtml += renderItemHtml(activeRenderItems[i]);
    }
    renderedChunkCount = nextEnd;

    const sentinel = document.getElementById('files-sentinel');
    if (sentinel) {
        sentinel.insertAdjacentHTML('beforebegin', chunkHtml);
        if (renderedChunkCount >= activeRenderItems.length) {
            sentinel.remove();
            if (chunkObserver) chunkObserver.disconnect();
        } else {
            const span = sentinel.querySelector('span');
            if (span) span.innerText = '⚡ Loading more items (' + renderedChunkCount + '/' + activeRenderItems.length + ')...';
        }
    } else {
        const container = document.getElementById('files');
        if (container) container.insertAdjacentHTML('beforeend', chunkHtml);
    }
}

function ensureItemRendered(name) {
    if (!activeRenderItems || renderedChunkCount >= activeRenderItems.length) return;
    const targetIdx = activeRenderItems.findIndex(function(i) { return i.name === name; });
    if (targetIdx >= renderedChunkCount) {
        const neededEnd = Math.min(activeRenderItems.length, targetIdx + 20);
        let chunkHtml = '';
        for (let i = renderedChunkCount; i < neededEnd; i++) {
            chunkHtml += renderItemHtml(activeRenderItems[i]);
        }
        renderedChunkCount = neededEnd;
        const sentinel = document.getElementById('files-sentinel');
        if (sentinel) {
            sentinel.insertAdjacentHTML('beforebegin', chunkHtml);
            if (renderedChunkCount >= activeRenderItems.length) {
                sentinel.remove();
                if (chunkObserver) chunkObserver.disconnect();
            }
        }
    }
}

async function loadFiles(targetPath, retryCount = 0) {
    const filesContainer = document.getElementById('files');
    try {
        const sftpInfo = parseSftpUrl(targetPath);
        if (sftpInfo) {
            const res = await fetch(`/api/sftp/list?connectionId=${encodeURIComponent(sftpInfo.connectionId)}&path=${encodeURIComponent(sftpInfo.remotePath)}`);
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                showToast(errData.error || 'SFTP: Access denied or folder not found', '⚠️');
                if (filesContainer) {
                    filesContainer.innerHTML = `
                        <div class="empty-state-card" style="grid-column: 1 / -1; padding: 48px 20px; text-align: center;">
                            <div style="font-size: 32px; margin-bottom: 12px;">⚠️</div>
                            <div style="font-size: 15px; font-weight: 600; color: #f1f2f6; margin-bottom: 6px;">SFTP Folder Inaccessible</div>
                            <div style="font-size: 12px; color: #888899; margin-bottom: 18px; max-width: 360px; margin-left: auto; margin-right: auto;">${escapeHtml(errData.error || 'Remote path could not be found or access was denied.')}</div>
                            <div style="display: flex; gap: 8px; justify-content: center;">
                                <button class="btn-action-primary" onclick="loadFiles('${escapeHtml(targetPath)}')" style="padding: 6px 16px; border-radius: 6px; cursor: pointer; background: #6c5ce7; color: white; border: none;">🔄 Retry</button>
                                <button class="btn-action-secondary" onclick="goHome()" style="padding: 6px 16px; border-radius: 6px; cursor: pointer; background: rgba(255,255,255,0.1); color: #f1f2f6; border: 1px solid rgba(255,255,255,0.15);">🏠 Go to Home</button>
                            </div>
                        </div>`;
                }
                return;
            }
            const sftpData = await res.json();
            currentPath = `sftp://${sftpInfo.connectionId}${sftpData.currentPath.startsWith('/') ? sftpData.currentPath : '/' + sftpData.currentPath}`;
            isWindows = false;
            document.getElementById('path').value = currentPath;
            renderBreadcrumbs();
            updateActiveTabAfterLoad(currentPath);

            currentItems = (sftpData.items || []).map(item => ({
                ...item,
                isSftp: true,
                connectionId: sftpInfo.connectionId,
                path: `sftp://${sftpInfo.connectionId}${item.remotePath || (sftpData.currentPath === '/' ? '/' + item.name : sftpData.currentPath + '/' + item.name)}`
            }));
            selectedItem = null;
            selectedItems = [];
            lastSelectedName = null;

            document.getElementById('search').value = '';
            applySortAndRender();

            document.getElementById('preview-content').innerHTML = 'Select a remote file to preview.<br><br>💡 Tap <strong>Spacebar</strong> for Quick Look or double-click to edit in-line!';
            document.querySelector('#preview-pane h2').innerText = 'Remote Preview';

            renderBookmarks();
            renderSftpSidebar();
            return;
        }

        const cloudInfo = parseCloudUrl(targetPath);
        if (cloudInfo) {
            const res = await fetch(`/api/cloud/list?connectionId=${encodeURIComponent(cloudInfo.connectionId)}&path=${encodeURIComponent(cloudInfo.remotePath)}`);
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                showToast(errData.error || 'Cloud Storage: Access denied or folder not found', '⚠️');
                if (filesContainer) {
                    filesContainer.innerHTML = `
                        <div class="empty-state-card" style="grid-column: 1 / -1; padding: 48px 20px; text-align: center;">
                            <div style="font-size: 32px; margin-bottom: 12px;">☁️</div>
                            <div style="font-size: 15px; font-weight: 600; color: #f1f2f6; margin-bottom: 6px;">Cloud Storage Folder Inaccessible</div>
                            <div style="font-size: 12px; color: #888899; margin-bottom: 18px; max-width: 360px; margin-left: auto; margin-right: auto;">${escapeHtml(errData.error || 'Remote path could not be found or credentials expired.')}</div>
                            <div style="display: flex; gap: 8px; justify-content: center;">
                                <button class="btn-action-primary" onclick="loadFiles('${escapeHtml(targetPath)}')" style="padding: 6px 16px; border-radius: 6px; cursor: pointer; background: #6c5ce7; color: white; border: none;">🔄 Retry</button>
                                <button class="btn-action-secondary" onclick="goHome()" style="padding: 6px 16px; border-radius: 6px; cursor: pointer; background: rgba(255,255,255,0.1); color: #f1f2f6; border: 1px solid rgba(255,255,255,0.15);">🏠 Go to Home</button>
                            </div>
                        </div>`;
                }
                return;
            }
            const cloudData = await res.json();
            currentPath = `cloud://${cloudInfo.connectionId}${cloudData.currentPath.startsWith('/') ? cloudData.currentPath : '/' + cloudData.currentPath}`;
            isWindows = false;
            document.getElementById('path').value = currentPath;
            renderBreadcrumbs();
            updateActiveTabAfterLoad(currentPath);

            currentItems = (cloudData.items || []).map(item => ({
                ...item,
                isCloud: true,
                connectionId: cloudInfo.connectionId,
                path: `cloud://${cloudInfo.connectionId}${item.remotePath || (cloudData.currentPath === '/' ? '/' + item.name : cloudData.currentPath + '/' + item.name)}`
            }));
            selectedItem = null;
            selectedItems = [];
            lastSelectedName = null;

            document.getElementById('search').value = '';
            applySortAndRender();

            document.getElementById('preview-content').innerHTML = 'Select a cloud file to preview.<br><br>💡 Tap <strong>Spacebar</strong> for Quick Look or double-click to view details!';
            const previewH2 = document.querySelector('#preview-pane h2');
            if (previewH2) previewH2.innerText = 'Cloud Storage';

            renderBookmarks();
            renderCloudSidebar();
            return;
        }

        const res = await fetch('/api/files/list?path=' + encodeURIComponent(targetPath || '.'));
        if (!res.ok) {
            // If initial targetPath failed, and it was not Home, automatically fall back to Home!
            if (targetPath && targetPath !== '.' && targetPath !== '/' && retryCount === 0) {
                console.warn(`Target path "${targetPath}" returned ${res.status}. Falling back to default Home directory.`);
                showToast(`Could not open "${getTabTitleForPath(targetPath)}", opening Home...`, '⚠️');
                loadFiles('.', 1);
                return;
            }

            showToast('Access denied or folder not found', '⚠️');
            if (filesContainer) {
                filesContainer.innerHTML = `
                    <div class="empty-state-card" style="grid-column: 1 / -1; padding: 48px 20px; text-align: center;">
                        <div style="font-size: 32px; margin-bottom: 12px;">📁</div>
                        <div style="font-size: 15px; font-weight: 600; color: #f1f2f6; margin-bottom: 6px;">Folder Not Found or Inaccessible</div>
                        <div style="font-size: 12px; color: #888899; margin-bottom: 18px; max-width: 360px; margin-left: auto; margin-right: auto;">The requested path <code style="background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px;">${escapeHtml(targetPath || '')}</code> could not be accessed.</div>
                        <div style="display: flex; gap: 8px; justify-content: center;">
                            <button class="btn-action-primary" onclick="loadFiles('${escapeHtml(targetPath || '.')}')" style="padding: 6px 16px; border-radius: 6px; cursor: pointer; background: #6c5ce7; color: white; border: none;">🔄 Retry</button>
                            <button class="btn-action-secondary" onclick="goHome()" style="padding: 6px 16px; border-radius: 6px; cursor: pointer; background: rgba(255,255,255,0.1); color: #f1f2f6; border: 1px solid rgba(255,255,255,0.15);">🏠 Go to Home</button>
                        </div>
                    </div>`;
            }
            return;
        }

        const data = await res.json();
        currentPath = (data && typeof data.currentPath === 'string') ? data.currentPath : (targetPath || '/');
        // If initial history entry was '.' or empty, update it with true resolved path
        if (navHistory.length > 0 && (navHistory[0] === '.' || navHistory[0] === '')) {
            navHistory[0] = normalizeNavPath(currentPath);
            const activeTab = tabs.find(function(t) { return t.id === activeTabId; });
            if (activeTab) {
                activeTab.history = [...navHistory];
            }
        }
        isWindows = isWindowsPlatform || (typeof currentPath === 'string' && (currentPath.includes('\\') || /^[a-zA-Z]:/.test(currentPath)));
        document.getElementById('path').value = currentPath;
        renderBreadcrumbs();
        updateActiveTabAfterLoad(currentPath);
        updateNavButtons();

        currentItems = Array.isArray(data.items) ? data.items : [];
        selectedItem = null;
        selectedItems = [];
        lastSelectedName = null;

        document.getElementById('search').value = '';
        applySortAndRender();

        document.getElementById('preview-content').innerHTML = 'Select a file to preview.<br><br>💡 Tap <strong>Spacebar</strong> for Quick Look or double-click to open in VS Code!';
        document.querySelector('#preview-pane h2').innerText = 'Preview';

        // Asynchronously fetch Git status & update Bookmarks bar
        fetchGitStatus(currentPath);
        renderBookmarks();
    } catch (err) {
        console.error('Failed to load files:', err);
        // If engine was just starting up, try automatic retry after 600ms (up to 2 retries)
        if (retryCount < 2) {
            console.log(`Retrying folder load (${retryCount + 1}/2)...`);
            setTimeout(() => {
                loadFiles(targetPath, retryCount + 1);
            }, 600);
            return;
        }

        showToast('Failed to connect to backend engine', '❌');
        if (filesContainer) {
            filesContainer.innerHTML = `
                <div class="empty-state-card" style="grid-column: 1 / -1; padding: 48px 20px; text-align: center;">
                    <div style="font-size: 32px; margin-bottom: 12px;">⚡</div>
                    <div style="font-size: 15px; font-weight: 600; color: #f1f2f6; margin-bottom: 6px;">Connecting to VenEl Engine...</div>
                    <div style="font-size: 12px; color: #888899; margin-bottom: 18px; max-width: 360px; margin-left: auto; margin-right: auto;">The file engine is warming up or temporarily restarting.</div>
                    <div style="display: flex; gap: 8px; justify-content: center;">
                        <button class="btn-action-primary" onclick="loadFiles('${escapeHtml(targetPath || '.')}')" style="padding: 6px 16px; border-radius: 6px; cursor: pointer; background: #6c5ce7; color: white; border: none;">🔄 Reconnect</button>
                        <button class="btn-action-secondary" onclick="goHome()" style="padding: 6px 16px; border-radius: 6px; cursor: pointer; background: rgba(255,255,255,0.1); color: #f1f2f6; border: 1px solid rgba(255,255,255,0.15);">🏠 Home Folder</button>
                    </div>
                </div>`;
        }
    }
}

function isArchiveFileName(name) {
    if (!name) return false;
    const lower = name.toLowerCase();
    return lower.endsWith('.zip') || lower.endsWith('.tar') || lower.endsWith('.tar.gz') || lower.endsWith('.tgz') || lower.endsWith('.gz');
}

function refreshCurrentFolder() {
    const btnReload = document.getElementById('btn-reload');
    if (btnReload) {
        btnReload.classList.add('spinning');
        setTimeout(function() {
            btnReload.classList.remove('spinning');
        }, 500);
    }
    if (isDualPane) {
        refreshCommanderPane(activePaneId);
        return;
    }
    loadFiles(currentPath);
    showToast('Refreshed', '🔄');
}

function syncItemSelectionDOM() {
    const selectedNames = new Set(selectedItems.map(function(i) { return i.name; }));
    document.querySelectorAll('#files .item').forEach(function(el) {
        const name = el.getAttribute('data-name');
        if (selectedNames.has(name)) {
            el.classList.add('selected');
        } else {
            el.classList.remove('selected');
        }
    });
}

function handleContainerClick(e) {
    if (e.target.id === 'file-list-container' || e.target.id === 'files') {
        selectedItem = null;
        selectedItems = [];
        lastSelectedName = null;
        updateSelectionState();
        syncItemSelectionDOM();
    }
}

function selectAllItems() {
    const items = (displayedItems && displayedItems.length > 0) ? displayedItems : (currentItems || []);
    if (!items || items.length === 0) return;
    selectedItems = items.slice();
    selectedItem = selectedItems[0] || null;
    lastSelectedName = selectedItem ? selectedItem.name : null;
    syncItemSelectionDOM();
    updateSelectionState();
    if (selectedItems.length === 1) {
        handlePreview(selectedItem.name, selectedItem.type === 'Directory');
    } else if (selectedItems.length > 1) {
        renderMultiSelectionPreview();
    }
}

function invertSelection() {
    const items = (displayedItems && displayedItems.length > 0) ? displayedItems : (currentItems || []);
    if (!items || items.length === 0) return;
    const currentSelectedNames = new Set(selectedItems.map(function(i) { return i.name; }));
    selectedItems = items.filter(function(i) { return !currentSelectedNames.has(i.name); });
    selectedItem = selectedItems.length > 0 ? selectedItems[0] : null;
    lastSelectedName = selectedItem ? selectedItem.name : null;
    syncItemSelectionDOM();
    updateSelectionState();
    if (selectedItems.length === 1) {
        handlePreview(selectedItem.name, selectedItem.type === 'Directory');
    } else if (selectedItems.length > 1) {
        renderMultiSelectionPreview();
    } else {
        const content = document.getElementById('preview-content');
        if (content) content.innerHTML = 'Select a file to preview.<br><br>💡 Tap <strong>Spacebar</strong> for Quick Look or double-click to open in VS Code!';
    }
}

function handleItemClick(e, name, isDir) {
    e.stopPropagation();
    const item = currentItems.find(function(i) { return i.name === name; }) || { name: name, type: isDir ? 'Directory' : 'File' };

    if (e.shiftKey && lastSelectedName) {
        // Range selection (Windows/macOS style)
        const fromIdx = currentItems.findIndex(function(i) { return i.name === lastSelectedName; });
        const toIdx = currentItems.findIndex(function(i) { return i.name === name; });
        if (fromIdx !== -1 && toIdx !== -1) {
            const start = Math.min(fromIdx, toIdx);
            const end = Math.max(fromIdx, toIdx);
            selectedItems = currentItems.slice(start, end + 1);
            selectedItem = item;
        } else {
            selectedItems = [item];
            selectedItem = item;
            lastSelectedName = name;
        }
    } else if (e.ctrlKey || e.metaKey) {
        // Multi-select toggle (Cmd/Ctrl click)
        const existingIdx = selectedItems.findIndex(function(i) { return i.name === name; });
        if (existingIdx !== -1) {
            selectedItems.splice(existingIdx, 1);
            selectedItem = selectedItems.length > 0 ? selectedItems[selectedItems.length - 1] : null;
        } else {
            selectedItems.push(item);
            selectedItem = item;
            lastSelectedName = name;
        }
    } else {
        // Single item selection
        selectedItems = [item];
        selectedItem = item;
        lastSelectedName = name;
    }

    syncItemSelectionDOM();
    updateSelectionState();

    if (selectedItems.length === 1) {
        handlePreview(selectedItem.name, selectedItem.type === 'Directory');
    } else if (selectedItems.length > 1) {
        renderMultiSelectionPreview();
    }
}

function renderMultiSelectionPreview() {
    const count = selectedItems.length;
    let totalBytes = 0;
    let fileCount = 0;
    let dirCount = 0;
    for (let i = 0; i < selectedItems.length; i++) {
        if (selectedItems[i].type === 'Directory') {
            dirCount++;
        } else {
            fileCount++;
            totalBytes += (selectedItems[i].size || 0);
        }
    }

    const headerElem = document.querySelector('#preview-pane h2');
    if (headerElem) headerElem.innerText = count + ' Items Selected';

    const previewEl = document.getElementById('preview-content');
    if (previewEl) {
        let rowsHtml = '';
        for (let i = 0; i < selectedItems.length; i++) {
            const item = selectedItems[i];
            rowsHtml += '<tr style="border-bottom: 1px solid rgba(255,255,255,0.03);">' +
                        '<td style="padding: 4px 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px;">' + (item.type === 'Directory' ? '📁 ' : '📄 ') + escapeHtml(item.name) + '</td>' +
                        '<td style="padding: 4px 8px; text-align: right; color: var(--text-muted); white-space: nowrap;">' + (item.type === 'Directory' ? '--' : formatBytes(item.size || 0)) + '</td>' +
                        '</tr>';
        }

        previewEl.innerHTML = 
            '<div style="display: flex; flex-direction: column; gap: 12px; padding: 12px 6px; font-size: 12px;">' +
            '<div style="display: flex; align-items: center; gap: 8px;">' +
            '<span style="font-size: 26px;">🗂️</span>' +
            '<div>' +
            '<div style="font-weight: 600; font-size: 14px; color: var(--text-main);">' + count + ' items selected</div>' +
            '<div style="font-size: 11px; color: var(--text-muted);">' + (fileCount > 0 ? fileCount + ' files' : '') + (fileCount > 0 && dirCount > 0 ? ', ' : '') + (dirCount > 0 ? dirCount + ' folders' : '') + ' &bull; ' + formatBytes(totalBytes) + '</div>' +
            '</div>' +
            '</div>' +
            '<div style="background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; display: flex; flex-direction: column; gap: 8px;">' +
            '<div style="font-weight: 600; font-size: 11px; color: #a29bfe; text-transform: uppercase;">Batch Actions</div>' +
            '<div style="display: flex; gap: 8px; flex-wrap: wrap;">' +
            '<button class="tool-btn primary" onclick="showBatchRenameModal()" style="padding: 6px 12px;">🏷️ Smart Batch Rename</button>' +
            '<button class="tool-btn" onclick="handleCompressSelected()" style="padding: 6px 12px;">🗜️ Compress to .zip</button>' +
            '</div>' +
            '</div>' +
            '<div style="max-height: 220px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 6px; background: rgba(0,0,0,0.1);">' +
            '<table style="width: 100%; border-collapse: collapse; font-size: 11px;">' +
            rowsHtml +
            '</table>' +
            '</div>' +
            '</div>';
    }
}

function updateSelectionState() {
    const count = selectedItems.length;
    const hasSelection = count > 0;
    const isSingle = count === 1;

    const btnCut = document.getElementById('btn-cut');
    if (btnCut) btnCut.disabled = !hasSelection;
    const btnCopy = document.getElementById('btn-copy');
    if (btnCopy) btnCopy.disabled = !hasSelection;
    const btnRename = document.getElementById('btn-rename');
    if (btnRename) btnRename.disabled = !isSingle;
    const btnDelete = document.getElementById('btn-delete');
    if (btnDelete) btnDelete.disabled = !hasSelection;
    const btnProperties = document.getElementById('btn-properties');
    if (btnProperties) btnProperties.disabled = !isSingle;

    const btnBatchRename = document.getElementById('btn-batch-rename');
    if (btnBatchRename) btnBatchRename.disabled = !hasSelection;

    const btnZip = document.getElementById('btn-zip-archive');
    if (btnZip) btnZip.disabled = !hasSelection;

    const isArchive = isSingle && selectedItem && isArchiveFileName(selectedItem.name);
    const btnUnzip = document.getElementById('btn-unzip-archive');
    if (btnUnzip) btnUnzip.style.display = isArchive ? 'inline-flex' : 'none';

    const btnDiffCompare = document.getElementById('btn-diff-compare');
    if (btnDiffCompare) btnDiffCompare.style.display = count === 2 ? 'inline-flex' : 'none';

    // Sync Desktop Menu Bar entries
    setMenuEntryDisabled('menu-item-cut', !hasSelection);
    setMenuEntryDisabled('menu-item-copy', !hasSelection);
    setMenuEntryDisabled('menu-item-rename', !isSingle);
    setMenuEntryDisabled('menu-item-delete', !hasSelection);
    setMenuEntryDisabled('menu-item-properties', !isSingle);
    setMenuEntryDisabled('menu-item-batch-rename', !hasSelection);
    setMenuEntryDisabled('menu-item-zip', !hasSelection);
    setMenuEntryDisabled('menu-item-unzip', !isArchive);
    setMenuEntryDisabled('menu-item-diff', count !== 2);
    setMenuEntryDisabled('menu-item-open-editor', !hasSelection);
    setMenuEntryDisabled('menu-item-quicklook', !isSingle);

    const isSingleFile = isSingle && selectedItem && selectedItem.type !== 'Directory';
    setMenuEntryDisabled('menu-item-open-system', !isSingleFile);
    const menuLabelSystem = document.getElementById('menu-label-open-system');
    if (menuLabelSystem && selectedItem) {
        menuLabelSystem.textContent = getSystemAppFriendlyLabel(selectedItem.name);
    }
    const isScript = isSingleFile && isScriptFile(selectedItem.name);
    const menuItemRun = document.getElementById('menu-item-run-script');
    if (menuItemRun) {
        menuItemRun.style.display = isScript ? 'flex' : 'none';
        setMenuEntryDisabled('menu-item-run-script', !isScript);
    }

    const isBinary = isSingle && selectedItem && /\.(dll|exe|nupkg)$/i.test(selectedItem.name);
    setMenuEntryDisabled('menu-item-decompile', !isBinary);
    setMenuEntryDisabled('menu-item-export', !isBinary);

    const selectedInfo = document.getElementById('status-selected-info');
    if (count === 1 && selectedItem) {
        selectedInfo.innerText = 'Selected: ' + selectedItem.name + (selectedItem.type === 'File' ? ' (' + formatBytes(selectedItem.size) + ')' : '');
    } else if (count > 1) {
        let totalBytes = 0;
        for (let i = 0; i < selectedItems.length; i++) {
            totalBytes += (selectedItems[i].size || 0);
        }
        selectedInfo.innerText = count + ' items selected (' + formatBytes(totalBytes) + ')';
    } else {
        selectedInfo.innerText = 'No selection';
    }
}

function handleDoubleClick(name, isDir) {
    let nextPath;
    if (selectedItem && selectedItem.path) {
        nextPath = selectedItem.path;
    } else {
        const sep = isWindows ? '\\' : '/';
        nextPath = currentPath.endsWith(sep) ? currentPath + name : currentPath + sep + name;
    }
    if (isDir) {
        navigateTo(nextPath);
    } else {
        if (nextPath.startsWith('sftp://') || nextPath.startsWith('cloud://')) {
            activePreviewPath = nextPath;
            activePreviewIsDir = false;
            toggleInlineEditor();
        } else {
            smartOpenFile(nextPath);
        }
    }
}

// ══════════════════════════════════════════════════════════