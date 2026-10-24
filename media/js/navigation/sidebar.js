/**
 * VenEl File Manager - Sidebar, Splitters & Bookmarks
 * Pinned favorites, system drives, working directory, and resizer splitters.
 */
// ══════════════════════════════════════════════════════════
// 📐 INTERACTIVE DRAGGABLE RESIZERS (SIDEBAR & PREVIEW PANE)
// ══════════════════════════════════════════════════════════
function initSplitters() {
    const mainContent = document.querySelector('.main-content');
    const sidebar = document.getElementById('quick-access-sidebar');
    const sidebarResizer = document.getElementById('sidebar-resizer');
    const preview = document.getElementById('preview-pane');
    const previewResizer = document.getElementById('preview-resizer');

    if (!mainContent) return;

    // Restore saved custom widths
    const savedSidebarWidth = safeStorage.getItem('venel_sidebar_width');
    if (savedSidebarWidth && sidebar && !sidebar.classList.contains('collapsed')) {
        sidebar.style.width = savedSidebarWidth + 'px';
    }
    const savedPreviewWidth = safeStorage.getItem('venel_preview_width');
    if (savedPreviewWidth && preview && !preview.classList.contains('collapsed')) {
        preview.style.width = savedPreviewWidth + 'px';
    }

    // A. Left Sidebar Splitter Drag
    if (sidebar && sidebarResizer) {
        let isDraggingSidebar = false;
        let startX = 0;
        let startWidth = 0;

        sidebarResizer.addEventListener('mousedown', function(e) {
            e.preventDefault();
            isDraggingSidebar = true;
            startX = e.clientX;
            startWidth = sidebar.getBoundingClientRect().width;
            sidebarResizer.classList.add('resizing');
            mainContent.classList.add('resizing-active');
            document.body.style.cursor = 'col-resize';
        });

        sidebarResizer.addEventListener('dblclick', function() {
            sidebar.style.width = '195px';
            safeStorage.setItem('venel_sidebar_width', '195');
            showToast('Sidebar width reset (195px)', '📐');
        });

        window.addEventListener('mousemove', function(e) {
            if (!isDraggingSidebar) return;
            let newWidth = startWidth + (e.clientX - startX);
            if (newWidth < 130) newWidth = 130;
            if (newWidth > 480) newWidth = 480;
            sidebar.style.width = newWidth + 'px';
            safeStorage.setItem('venel_sidebar_width', newWidth);
        });

        window.addEventListener('mouseup', function() {
            if (isDraggingSidebar) {
                isDraggingSidebar = false;
                sidebarResizer.classList.remove('resizing');
                mainContent.classList.remove('resizing-active');
                document.body.style.cursor = '';
            }
        });
    }

    // B. Left Preview Pane Splitter Drag
    if (preview && previewResizer) {
        let isDraggingPreview = false;
        let startX = 0;
        let startWidth = 0;

        previewResizer.addEventListener('mousedown', function(e) {
            e.preventDefault();
            isDraggingPreview = true;
            startX = e.clientX;
            startWidth = preview.getBoundingClientRect().width;
            previewResizer.classList.add('resizing');
            mainContent.classList.add('resizing-active');
            document.body.style.cursor = 'col-resize';
        });

        previewResizer.addEventListener('dblclick', function() {
            preview.style.width = '320px';
            safeStorage.setItem('venel_preview_width', '320');
            showToast('Preview width reset (320px)', '📐');
        });

        window.addEventListener('mousemove', function(e) {
            if (!isDraggingPreview) return;
            let newWidth = startWidth + (startX - e.clientX);
            if (newWidth < 180) newWidth = 180;
            if (newWidth > 750) newWidth = 750;
            preview.style.width = newWidth + 'px';
            safeStorage.setItem('venel_preview_width', newWidth);
        });

        window.addEventListener('mouseup', function() {
            if (isDraggingPreview) {
                isDraggingPreview = false;
                previewResizer.classList.remove('resizing');
                mainContent.classList.remove('resizing-active');
                document.body.style.cursor = '';
            }
        });
    }

    // C. Dual-Pane Commander Resizer
    if (typeof initDualPaneResizer === 'function') {
        initDualPaneResizer();
    }
}


// ══════════════════════════════════════════════════════════
// ◧ QUICK ACCESS SIDEBAR
// ══════════════════════════════════════════════════════════
function toggleSidebarRail(forcedState) {
    const sidebar = document.getElementById('quick-access-sidebar');
    const resizer = document.getElementById('sidebar-resizer');
    const btn = document.getElementById('btn-rail-toggle');
    const chevron = document.getElementById('rail-toggle-chevron');
    const label = document.getElementById('rail-toggle-label');
    const edgeBtn = document.getElementById('sidebar-edge-toggle');
    if (sidebar) {
        let isNowCollapsed;
        if (typeof forcedState === 'boolean') {
            isNowCollapsed = forcedState;
            sidebar.classList.toggle('collapsed', isNowCollapsed);
        } else {
            isNowCollapsed = sidebar.classList.toggle('collapsed');
        }
        safeStorage.setItem('venel_sidebar_collapsed', isNowCollapsed ? 'true' : 'false');
        if (chevron) chevron.textContent = isNowCollapsed ? '❯' : '❮';
        if (label) label.textContent = 'Places';
        if (btn) {
            btn.title = isNowCollapsed ? 'Expand Places (>)' : 'Collapse Places (<)';
            btn.classList.toggle('active', isNowCollapsed);
        }
        if (edgeBtn) {
            edgeBtn.style.display = 'none';
        }
        if (resizer) {
            resizer.style.display = isNowCollapsed ? 'none' : 'block';
        }
    }
    updateDockStripVisibility();
    updateViewMenuChecks();
}

function renderQuickAccessDrives() {
    const container = document.getElementById('quick-drives');
    if (!container) return;
    let html = '';
    for (let i = 0; i < systemRoots.length; i++) {
        const root = systemRoots[i];
        if (root.type === 'Home' || root.type === 'Desktop' || root.type === 'Documents' || root.type === 'Downloads') continue;
        html += '<div class="quick-item" onclick="navigateTo(\'' + escapePath(root.path) + '\')">' +
                '<i>' + (root.type === 'Drive' ? '💻' : '📁') + '</i> ' +
                '<span>' + escapeHtml(root.name) + '</span>' +
                '</div>';
    }
    container.innerHTML = html;
}



// ══════════════════════════════════════════════════════════
// 🌿 GIT STATUS & VCS BADGING
// ══════════════════════════════════════════════════════════
let currentGitStatuses = {};
let currentGitRepo = false;

async function fetchGitStatus(dirPath) {
    try {
        const res = await fetch('/api/files/gitStatus?path=' + encodeURIComponent(dirPath));
        if (!res.ok) return;
        const data = await res.json();
        const branchContainer = document.getElementById('status-git-branch');
        const branchNameElem = document.getElementById('git-branch-name');
        const syncStatusElem = document.getElementById('git-sync-status');

        if (data.isRepo) {
            currentGitRepo = true;
            currentGitStatuses = data.statuses || {};
            if (branchContainer) branchContainer.style.display = 'inline-flex';
            if (branchNameElem) branchNameElem.textContent = data.branch || 'HEAD';
            if (syncStatusElem) {
                let syncText = '';
                if (data.ahead > 0) syncText += ' ↑' + data.ahead;
                if (data.behind > 0) syncText += ' ↓' + data.behind;
                syncStatusElem.textContent = syncText;
            }
        } else {
            currentGitRepo = false;
            currentGitStatuses = {};
            if (branchContainer) branchContainer.style.display = 'none';
        }
        // Re-render items with updated git badges
        applyFilterAndRender();
    } catch {
        currentGitRepo = false;
        currentGitStatuses = {};
        const branchContainer = document.getElementById('status-git-branch');
        if (branchContainer) branchContainer.style.display = 'none';
    }
}

function refreshGitStatus() {
    fetchGitStatus(currentPath);
    showToast('Refreshing Git status...', '🌿');
}

// ══════════════════════════════════════════════════════════
// ⭐ BOOKMARKS / FAVORITES SYSTEM
// ══════════════════════════════════════════════════════════
let userBookmarks = [];

function initBookmarks() {
    try {
        const stored = safeStorage.getItem('venel_bookmarks_v1');
        if (stored) {
            userBookmarks = JSON.parse(stored);
        } else {
            // Default starting bookmark
            userBookmarks = [
                { name: 'Home', path: (typeof defaultHomePath !== 'undefined' ? defaultHomePath : '.') || '.', icon: '🏠', isDir: true, isDefault: true }
            ];
            saveBookmarks();
        }
    } catch {
        userBookmarks = [];
    }
    renderBookmarks();
}

function saveBookmarks() {
    try {
        safeStorage.setItem('venel_bookmarks_v1', JSON.stringify(userBookmarks));
    } catch {}
}

function updateAddressBarStar() {
    const isCurrentPinned = typeof userBookmarks !== 'undefined' && userBookmarks.some(function(b) { return b.path === currentPath; });
    const addressPinBtn = document.getElementById('btn-pin-address-bar');
    const addressStarIcon = document.getElementById('address-star-icon');
    if (addressPinBtn) {
        if (isCurrentPinned) {
            addressPinBtn.classList.add('pinned');
            if (addressStarIcon) addressStarIcon.textContent = '★';
            addressPinBtn.title = 'Unpin this folder from Favorites (★)';
        } else {
            addressPinBtn.classList.remove('pinned');
            if (addressStarIcon) addressStarIcon.textContent = '☆';
            addressPinBtn.title = 'Pin this folder to Favorites (☆)';
        }
    }
}

function renderBookmarks() {
    const container = document.getElementById('bookmarks-chips');
    const favList = document.getElementById('favorites-list');
    const favCountBadge = document.getElementById('favorites-count-badge');
    const pinBtn = document.getElementById('btn-pin-current');
    const starIcon = document.getElementById('pin-star-icon');
    const starLabel = document.getElementById('pin-star-label');
    const previewPinBtn = document.getElementById('preview-pin-btn');

    const isCurrentPinned = userBookmarks.some(function(b) { return b.path === currentPath; });
    const addressPinBtn = document.getElementById('btn-pin-address-bar');
    const addressStarIcon = document.getElementById('address-star-icon');
    if (addressPinBtn) {
        if (isCurrentPinned) {
            addressPinBtn.classList.add('pinned');
            if (addressStarIcon) addressStarIcon.textContent = '★';
            addressPinBtn.title = 'Unpin this folder from Favorites (★)';
        } else {
            addressPinBtn.classList.remove('pinned');
            if (addressStarIcon) addressStarIcon.textContent = '☆';
            addressPinBtn.title = 'Pin this folder to Favorites (☆)';
        }
    }

    if (pinBtn) {
        if (isCurrentPinned) {
            pinBtn.classList.add('pinned');
            if (starIcon) starIcon.textContent = '★';
            starLabel.textContent = 'Pinned';
        } else {
            pinBtn.classList.remove('pinned');
            if (starIcon) starIcon.textContent = '☆';
            starLabel.textContent = 'Pin Folder';
        }
    }

    if (previewPinBtn && activePreviewPath) {
        const isPrevPinned = userBookmarks.some(function(b) { return b.path === activePreviewPath; });
        if (isPrevPinned) {
            previewPinBtn.classList.add('pinned');
            previewPinBtn.textContent = '★';
            previewPinBtn.title = 'Unpin this item from Favorites';
        } else {
            previewPinBtn.classList.remove('pinned');
            previewPinBtn.textContent = '☆';
            previewPinBtn.title = 'Pin this item to Favorites';
        }
    }

    if (favCountBadge) {
        favCountBadge.textContent = userBookmarks.length;
    }

    // 1. Render Top Bookmarks Bar Chips
    if (container) {
        let html = '';
        userBookmarks.forEach(function(b) {
            const isActive = b.path === currentPath;
            html += '<div class="bookmark-chip ' + (isActive ? 'active' : '') + '" onclick="navigateToBookmark(\'' + escapePath(b.path) + '\', ' + (b.isDir !== false) + ')" ondragover="handleBookmarkDragOver(event, \'' + escapePath(b.path) + '\')" ondragleave="handleBookmarkDragLeave(event)" ondrop="handleBookmarkDrop(event, \'' + escapePath(b.path) + '\')" title="' + escapeHtml(b.path) + '">' +
                '<span>' + (b.icon || '📁') + '</span>' +
                '<span class="chip-name">' + escapeHtml(b.name) + '</span>' +
                (!b.isDefault ? '<span class="remove-pin" onclick="event.stopPropagation(); removeBookmark(\'' + escapePath(b.path) + '\')" title="Unpin">✕</span>' : '') +
                '</div>';
        });
        container.innerHTML = html;
    }

    // 2. Render Left Places Sidebar Pinned Favorites List
    if (favList) {
        if (userBookmarks.length === 0) {
            favList.innerHTML = '<div class="favorites-empty-guide">⭐ Drag folders or files here to pin for quick access</div>';
        } else {
            let favHtml = '';
            userBookmarks.forEach(function(b) {
                const isActive = b.path === currentPath || (activePreviewPath && b.path === activePreviewPath);
                const isDir = b.isDir !== false;
                const visual = typeof getFileVisual === 'function' ? getFileVisual(b.name, isDir) : { icon: isDir ? '📁' : '📄' };
                const icon = b.icon || visual.icon || (isDir ? '📁' : '📄');
                const badge = isDir ? 'DIR' : (b.ext || b.name.split('.').pop() || 'FILE').toUpperCase();

                const favIconMarkup = (isDir && visual.svg) ? '<div class="fav-item-icon-svg">' + visual.svg + '</div>' : '<i class="fav-item-icon">' + icon + '</i>';

                favHtml += '<div class="fav-pinned-item ' + (isActive ? 'active' : '') + '" onclick="navigateToBookmark(\'' + escapePath(b.path) + '\', ' + isDir + ')" title="' + escapeHtml(b.path) + '">' +
                    '<div class="fav-item-main">' +
                        favIconMarkup +
                        '<span class="fav-item-name">' + escapeHtml(b.name) + '</span>' +
                    '</div>' +
                    '<div style="display: flex; align-items: center; gap: 4px;">' +
                        '<span class="fav-item-badge">' + escapeHtml(badge) + '</span>' +
                        '<div class="fav-item-actions">' +
                            '<button class="fav-action-btn" onclick="event.stopPropagation(); openTerminal(\'' + escapePath(b.path) + '\')" title="Open Integrated Terminal (⌥T)">💻</button>' +
                            (!b.isDefault ? '<button class="fav-action-btn fav-unpin-btn" onclick="event.stopPropagation(); removeBookmark(\'' + escapePath(b.path) + '\')" title="Unpin from Favorites">✕</button>' : '') +
                        '</div>' +
                    '</div>' +
                '</div>';
            });
            favList.innerHTML = favHtml;
        }
    }
}

function navigateToBookmark(targetPath, isDir) {
    if (isDir !== false) {
        navigateTo(targetPath);
    } else {
        const sep = isWindows ? '\\' : '/';
        const parts = targetPath.split(sep).filter(Boolean);
        const fileName = parts.pop();
        const parentDir = targetPath.substring(0, targetPath.lastIndexOf(sep)) || (isWindows ? 'C:\\' : '/');
        if (currentPath !== parentDir) {
            navigateTo(parentDir, function() {
                const found = currentItems.find(function(it) { return it.name === fileName; });
                if (found) {
                    selectItem(found, null);
                    handlePreview(found.name, found.type === 'Directory');
                }
            });
        } else {
            const found = currentItems.find(function(it) { return it.name === fileName; });
            if (found) {
                selectItem(found, null);
                handlePreview(found.name, found.type === 'Directory');
            }
        }
    }
}

function toggleSidebarSection(sectionName) {
    const body = document.getElementById(sectionName + '-section-body');
    const chevron = document.getElementById('chevron-' + sectionName);
    if (!body) return;
    const isCollapsed = !body.classList.contains('collapsed');
    if (isCollapsed) {
        body.classList.add('collapsed');
        if (chevron) chevron.classList.add('collapsed');
    } else {
        body.classList.remove('collapsed');
        if (chevron) chevron.classList.remove('collapsed');
    }
    try {
        safeStorage.setItem('venel_sec_collapsed_' + sectionName, isCollapsed ? '1' : '0');
    } catch {}
}

function initSidebarSections() {
    ['working-dir', 'favorites', 'places', 'sftp', 'cloud'].forEach(function(sec) {
        try {
            const stored = safeStorage.getItem('venel_sec_collapsed_' + sec);
            if (stored === '1') {
                const body = document.getElementById(sec + '-section-body');
                const chevron = document.getElementById('chevron-' + sec);
                if (body) body.classList.add('collapsed');
                if (chevron) chevron.classList.add('collapsed');
            }
        } catch {}
    });
}

// ══════════════════════════════════════════════════════════
// 💼 WORKING DIRECTORY & DYNAMIC HOST IDE WORKSPACE MANAGEMENT
// ══════════════════════════════════════════════════════════

function getTargetFolderForAction(overridePath) {
    if (overridePath && typeof overridePath === 'string') return overridePath;
    const sep = isWindows ? '\\' : '/';
    if (selectedItem && (selectedItem.type === 'Directory' || selectedItem.isDir)) {
        return selectedItem.path || (currentPath.endsWith(sep) ? currentPath + selectedItem.name : currentPath + sep + selectedItem.name);
    }
    return currentPath;
}

function updateIdeEnvironmentInfo(name, folders, primary) {
    if (name) {
        detectedIdeName = name;
        const ideBadge = document.getElementById('working-dir-ide-badge');
        if (ideBadge) {
            ideBadge.textContent = detectedIdeName;
            ideBadge.style.display = 'inline-block';
        }
        const menuOpenWs = document.getElementById('menu-label-open-workspace');
        if (menuOpenWs) {
            menuOpenWs.textContent = 'Open Current as ' + detectedIdeName + ' Workspace';
        }
        const menuOpenEd = document.getElementById('menu-label-open-editor');
        if (menuOpenEd) {
            menuOpenEd.textContent = 'Open in ' + detectedIdeName + ' Editor';
        }
        const diffIdeLabel = document.getElementById('diff-ide-btn-label');
        if (diffIdeLabel) {
            diffIdeLabel.textContent = detectedIdeName;
        }
        document.querySelectorAll('.ide-name-text').forEach(function(el) {
            el.textContent = detectedIdeName;
        });
    }
    if (Array.isArray(folders)) {
        ideWorkspaceFolders = folders;
    }
    if (primary) {
        idePrimaryWorkspace = primary;
    } else if (ideWorkspaceFolders.length > 0 && !idePrimaryWorkspace) {
        idePrimaryWorkspace = ideWorkspaceFolders[0].path;
    }

    if (!activeWorkingDirectory && idePrimaryWorkspace) {
        activeWorkingDirectory = idePrimaryWorkspace;
    }
    renderWorkingDirectoryCard();
}

function renderWorkingDirectoryCard() {
    const card = document.getElementById('working-dir-card');
    if (!card) return;

    if (!activeWorkingDirectory) {
        card.innerHTML = `
            <div style="padding: 10px; text-align: center; font-size: 11px; color: var(--text-dim, #888);">
                <div style="margin-bottom: 6px;">No working directory pinned.</div>
                <button class="working-dir-btn" onclick="setSelectionAsWorkingDirectory(currentPath)" title="Pin current folder as working directory">🎯 Set Current Folder</button>
            </div>
        `;
        return;
    }

    const sep = isWindows ? '\\' : '/';
    const parts = activeWorkingDirectory.replace(/[\\/]+$/, '').split(sep).filter(Boolean);
    const folderName = parts.length > 0 ? parts[parts.length - 1] : activeWorkingDirectory;

    card.innerHTML = `
        <div class="working-dir-card-header">
            <span class="working-dir-icon">💼</span>
            <div class="working-dir-meta">
                <span class="working-dir-name" title="${escapeHtml(folderName)}">${escapeHtml(folderName)}</span>
                <span class="working-dir-path" title="${escapeHtml(activeWorkingDirectory)}">${escapeHtml(activeWorkingDirectory)}</span>
            </div>
        </div>
        <div class="working-dir-actions">
            <div class="working-dir-btn-row">
                <button class="working-dir-btn" onclick="navigateTo('${escapePath(activeWorkingDirectory)}')" title="Navigate to Working Directory">📂 Open</button>
                <button class="working-dir-btn" onclick="openTerminal('${escapePath(activeWorkingDirectory)}')" title="Open Terminal in Working Directory">💻 Terminal</button>
            </div>
            <div class="working-dir-btn-row">
                <button class="working-dir-btn btn-ide" onclick="openSelectionAsIdeWorkspace('${escapePath(activeWorkingDirectory)}')" title="Open as ${escapeHtml(detectedIdeName)} Workspace">🚀 ${escapeHtml(detectedIdeName)}</button>
                <button class="working-dir-btn btn-reset" onclick="resetWorkingDirectory()" title="Reset Working Directory">🔄</button>
            </div>
        </div>
    `;
}

function setSelectionAsWorkingDirectory(targetPath) {
    hideContextMenu();
    const folder = getTargetFolderForAction(targetPath);
    if (!folder) return;

    activeWorkingDirectory = folder;
    try {
        safeStorage.setItem('venel_working_directory', folder);
    } catch {}

    // Post to IDE Extension
    if (window.parent && window.parent !== window) {
        window.parent.postMessage({ command: 'setWorkingDir', path: folder }, '*');
    }
    if (window.vscode) {
        window.vscode.postMessage({ command: 'setWorkingDir', path: folder });
    }

    renderWorkingDirectoryCard();
    const sep = isWindows ? '\\' : '/';
    const parts = folder.replace(/[\\/]+$/, '').split(sep).filter(Boolean);
    const name = parts.length > 0 ? parts[parts.length - 1] : folder;
    showToast('Working Directory set: ' + name, '💼');
}

function openSelectionAsIdeWorkspace(targetPath, newWindow = false) {
    hideContextMenu();
    const folder = getTargetFolderForAction(targetPath);
    if (!folder) return;

    // Post to IDE Extension
    if (window.parent && window.parent !== window) {
        window.parent.postMessage({ command: 'openAsWorkspace', path: folder, newWindow: !!newWindow }, '*');
    }
    if (window.vscode) {
        window.vscode.postMessage({ command: 'openAsWorkspace', path: folder, newWindow: !!newWindow });
    }

    showToast('Opening as ' + detectedIdeName + ' workspace...', '🚀');
}

function addSelectionToIdeWorkspace(targetPath) {
    hideContextMenu();
    const folder = getTargetFolderForAction(targetPath);
    if (!folder) return;

    // Post to IDE Extension
    if (window.parent && window.parent !== window) {
        window.parent.postMessage({ command: 'addToWorkspace', path: folder }, '*');
    }
    if (window.vscode) {
        window.vscode.postMessage({ command: 'addToWorkspace', path: folder });
    }

    showToast('Adding to ' + detectedIdeName + ' workspace...', '➕');
}

function resetWorkingDirectory() {
    hideContextMenu();
    const defaultRoot = idePrimaryWorkspace || (ideWorkspaceFolders.length > 0 ? ideWorkspaceFolders[0].path : null);
    activeWorkingDirectory = defaultRoot;
    if (defaultRoot) {
        safeStorage.setItem('venel_working_directory', defaultRoot);
    } else {
        safeStorage.removeItem('venel_working_directory');
    }
    renderWorkingDirectoryCard();
    showToast('Working Directory reset', '🔄');
}

async function initIdeEnvironment() {
    // 1. Initial URL param check
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const urlIde = urlParams.get('ideName');
        if (urlIde) {
            updateIdeEnvironmentInfo(urlIde, null, null);
        }
        const urlVer = urlParams.get('version');
        if (urlVer) {
            extensionVersion = urlVer;
            updateAboutVersionDisplay();
        }
    } catch {}

    // 2. Fetch server environment API
    try {
        const res = await fetch('/api/env/info').catch(() => null);
        if (res && res.ok) {
            const data = await res.json();
            if (data) {
                if (data.version) {
                    extensionVersion = data.version;
                }
                if (data.engine) {
                    backendEngineName = data.engine;
                }
                if (data.capabilities) {
                    window.currentEngineCapabilities = data.capabilities;
                }
                if (data.ideName) {
                    updateIdeEnvironmentInfo(data.ideName, data.workspaceFolders, data.primaryWorkspace);
                }
                updateAboutVersionDisplay();
                updateEngineStatusPill(data);
            }
        }
    } catch (e) {
        console.warn('Could not fetch /api/env/info', e);
    }

    // 3. Request IDE info via postMessage if framed
    try {
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ command: 'request-ide-info' }, '*');
            setTimeout(function() {
                try { window.parent.postMessage({ command: 'request-ide-info' }, '*'); } catch (e) {}
            }, 250);
        }
    } catch (e) {}

    renderWorkingDirectoryCard();
}

// ══════════════════════════════════════════════════════════