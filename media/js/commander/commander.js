/**
 * VenEl File Manager - Commander Dual-Pane Mode
 * Midnight / Total Commander dual-pane workflow and file synchronization.
 */
// ⫴ DUAL-PANE COMMANDER MODE (MIDNIGHT / TOTAL COMMANDER)
// ══════════════════════════════════════════════════════════
let isDualPane = false;
let activePaneId = 'left';
let commanderLeftState = { path: '', items: [], selected: null, selectedItems: [], history: [], historyIndex: -1 };
let commanderRightState = { path: '', items: [], selected: null, selectedItems: [], history: [], historyIndex: -1 };

function toggleDualPaneMode(forcedState) {
    if (typeof forcedState === 'boolean') {
        isDualPane = forcedState;
    } else {
        isDualPane = !isDualPane;
    }
    safeStorage.setItem('venel_dual_pane', isDualPane ? 'true' : 'false');
    const mainList = document.getElementById('file-list-container');
    const commanderContainer = document.getElementById('dual-pane-container');
    const toggleBtn = document.getElementById('btn-toggle-dual-pane');

    if (toggleBtn) toggleBtn.classList.toggle('active', isDualPane);
    updateViewMenuChecks();

    if (isDualPane) {
        if (mainList) mainList.style.display = 'none';
        if (commanderContainer) commanderContainer.style.display = 'flex';

        // Initialize left pane with current directory
        if (!commanderLeftState.path) {
            commanderLeftState.path = currentPath || '.';
        }
        // Initialize right pane with current directory or parent
        if (!commanderRightState.path) {
            const sep = isWindows ? '\\' : '/';
            const parts = (currentPath || '.').split(sep).filter(Boolean);
            if (parts.length > 1) {
                parts.pop();
                commanderRightState.path = isWindows ? (parts.join('\\') || 'C:\\') : ('/' + parts.join('/'));
            } else {
                commanderRightState.path = currentPath || '.';
            }
        }

        loadCommanderPane('left', commanderLeftState.path);
        loadCommanderPane('right', commanderRightState.path);
        setActivePane(activePaneId || 'left');
        showToast('Dual-Pane Commander Activated (Tab / F5 / F6)', '⫴');
    } else {
        if (commanderContainer) commanderContainer.style.display = 'none';
        if (mainList) mainList.style.display = 'flex';

        // Sync back currentPath from active pane
        const activeState = activePaneId === 'left' ? commanderLeftState : commanderRightState;
        if (activeState.path && activeState.path !== currentPath) {
            navigateTo(activeState.path);
        } else {
            loadFiles(currentPath);
        }
        showToast('Exited Dual-Pane Commander', '✕');
    }
}

async function loadCommanderPane(paneId, targetPath, isHistoryAction = false) {
    const state = paneId === 'left' ? commanderLeftState : commanderRightState;
    if (!state.history) {
        state.history = [];
        state.historyIndex = -1;
    }
    if (!isHistoryAction && targetPath) {
        if (state.historyIndex >= 0 && state.historyIndex < state.history.length - 1) {
            state.history = state.history.slice(0, state.historyIndex + 1);
        }
        if (state.history[state.history.length - 1] !== targetPath) {
            state.history.push(targetPath);
            state.historyIndex = state.history.length - 1;
        }
    }
    const bodyEl = document.getElementById('commander-files-' + paneId);
    const pathEl = document.getElementById('pane-' + paneId + '-path');
    if (!bodyEl) return;

    bodyEl.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);"><div class="spinner" style="margin: 0 auto 8px;"></div>Loading...</div>';

    try {
        const sftpInfo = parseSftpUrl(targetPath);
        if (sftpInfo) {
            const res = await fetch(`/api/sftp/list?connectionId=${encodeURIComponent(sftpInfo.connectionId)}&path=${encodeURIComponent(sftpInfo.remotePath)}`);
            if (!res.ok) {
                bodyEl.innerHTML = '<div style="padding: 20px; text-align: center; color: #ff7675;">SFTP Access Denied or Disconnected</div>';
                return;
            }
            const data = await res.json();
            state.path = `sftp://${sftpInfo.connectionId}${data.currentPath.startsWith('/') ? data.currentPath : '/' + data.currentPath}`;
            state.items = (data.items || []).map(item => ({
                ...item,
                isSftp: true,
                connectionId: sftpInfo.connectionId,
                path: `sftp://${sftpInfo.connectionId}${item.remotePath || (data.currentPath === '/' ? '/' + item.name : data.currentPath + '/' + item.name)}`
            }));
            state.selected = null;
            state.selectedItems = [];

            if (pathEl) {
                pathEl.textContent = state.path;
                pathEl.title = state.path;
            }

            renderCommanderBreadcrumbs(paneId, state.path);
            renderCommanderPaneItems(paneId);
            if (paneId === activePaneId) {
                currentPath = state.path;
                renderBreadcrumbs();
                updateNavButtons();
                updateAddressBarStar();
                updateCompactWindowTitle();
            }
            return;
        }

        const res = await fetch('/api/files/list?path=' + encodeURIComponent(targetPath));
        if (!res.ok) {
            bodyEl.innerHTML = '<div style="padding: 20px; text-align: center; color: #ff7675;">Access Denied or Not Found</div>';
            return;
        }
        const data = await res.json();
        state.path = data.currentPath;
        state.items = data.items || [];
        state.selected = null;
        state.selectedItems = [];

        if (pathEl) {
            pathEl.textContent = state.path;
            pathEl.title = state.path;
        }

        renderCommanderBreadcrumbs(paneId, state.path);
        renderCommanderPaneItems(paneId);
        if (paneId === activePaneId) {
            currentPath = state.path;
            renderBreadcrumbs();
            updateNavButtons();
            updateAddressBarStar();
            updateCompactWindowTitle();
        }

        // Asynchronously fetch Git status for Commander pane
        fetch('/api/files/gitStatus?path=' + encodeURIComponent(state.path))
            .then(function(r) { return r.ok ? r.json() : null; })
            .then(function(gData) {
                if (gData && gData.isRepo && gData.statuses) {
                    state.gitStatuses = gData.statuses;
                    renderCommanderPaneItems(paneId);
                }
            }).catch(function() {});
    } catch (err) {
        console.error(err);
        bodyEl.innerHTML = '<div style="padding: 20px; text-align: center; color: #ff7675;">Failed to load folder</div>';
    }
}

function renderCommanderPaneItems(paneId) {
    const state = paneId === 'left' ? commanderLeftState : commanderRightState;
    const bodyEl = document.getElementById('commander-files-' + paneId);
    const countEl = document.getElementById('pane-' + paneId + '-count');
    const selectedEl = document.getElementById('pane-' + paneId + '-selected');
    if (!bodyEl) return;

    const items = state.items || [];
    let html = '';

    // Up row
    html += '<div class="commander-item commander-item-parent" ondblclick="navigateCommanderParent(\'' + paneId + '\')">' +
                '<span class="commander-item-icon">⬆️</span>' +
                '<span class="commander-item-name">..</span>' +
                '<span class="commander-item-size">&lt;UP&gt;</span>' +
                '<span class="commander-item-date">Parent Folder</span>' +
            '</div>';

    items.forEach(function(item, idx) {
        const isDir = item.type === 'Directory';
        const visual = getFileVisual(item.name, isDir);
        const isSelected = state.selected && state.selected.name === item.name;
        const isInMulti = state.selectedItems.some(function(i) { return i.name === item.name; });

        const gitCode = (state.gitStatuses && state.gitStatuses[item.name]) || (currentGitStatuses && currentGitStatuses[item.name]);
        let gitBadgeHtml = '';
        let gitClass = '';
        if (gitCode) {
            const codeLower = gitCode.toLowerCase();
            const displayCode = gitCode === '?' ? 'U' : gitCode;
            const title = gitCode === 'M' ? 'Modified in Git' : (gitCode === 'U' || gitCode === '?' ? 'Untracked in Git' : (gitCode === 'A' ? 'Added / Staged in Git' : (gitCode === 'D' ? 'Deleted in Git' : (gitCode === 'R' ? 'Renamed in Git' : 'Changed in Git'))));
            gitClass = ' git-item git-status-' + codeLower;
            gitBadgeHtml = '<span class="git-badge git-' + codeLower + '" title="' + title + '">' + displayCode + '</span>';
        }

        html += '<div class="commander-item ' + (isSelected || isInMulti ? 'selected' : '') + gitClass + '" ' +
                    'data-name="' + escapeHtml(item.name) + '" ' +
                    (gitCode ? 'data-git-status="' + escapeHtml(gitCode) + '" ' : '') +
                    'onclick="selectCommanderItem(\'' + paneId + '\', ' + idx + ', event)" ' +
                    'ondblclick="openCommanderItem(\'' + paneId + '\', ' + idx + ')" ' +
                    'draggable="true" ondragstart="handleCommanderDragStart(\'' + paneId + '\', ' + idx + ', event)">' +
                    '<span class="commander-item-icon">' + (visual.svg || visual.icon) + '</span>' +
                    '<span class="commander-item-name" title="' + escapeHtml(item.name) + '">' + escapeHtml(item.name) + '</span>' +
                    gitBadgeHtml +
                    '<span class="commander-item-size">' + (isDir ? '&lt;DIR&gt;' : formatBytes(item.size)) + '</span>' +
                    '<span class="commander-item-date">' + (item.modified ? formatDate(item.modified) : '') + '</span>' +
                '</div>';
    });

    bodyEl.innerHTML = html;

    if (countEl) countEl.textContent = items.length + ' items';
    if (selectedEl) {
        const selCount = state.selectedItems.length || (state.selected ? 1 : 0);
        selectedEl.textContent = selCount > 0 ? (selCount + ' selected') : 'No selection';
    }
}

function selectCommanderItem(paneId, itemIndex, event) {
    if (event && event.stopPropagation) event.stopPropagation();
    setActivePane(paneId);
    const state = paneId === 'left' ? commanderLeftState : commanderRightState;
    const item = state.items[itemIndex];
    if (!item) return;

    if (event && (event.metaKey || event.ctrlKey)) {
        const existingIdx = state.selectedItems.findIndex(function(i) { return i.name === item.name; });
        if (existingIdx >= 0) {
            state.selectedItems.splice(existingIdx, 1);
            state.selected = state.selectedItems[state.selectedItems.length - 1] || null;
        } else {
            state.selectedItems.push(item);
            state.selected = item;
        }
    } else {
        state.selected = item;
        state.selectedItems = [item];
    }

    renderCommanderPaneItems(paneId);

    // Also update preview pane for selected item!
    const sep = isWindows ? '\\' : '/';
    const fullPath = state.path.endsWith(sep) ? state.path + item.name : state.path + sep + item.name;
    activePreviewPath = fullPath;
    activePreviewIsDir = (item.type === 'Directory');
    handlePreview(item.name, activePreviewIsDir);
}

function openCommanderItem(paneId, itemIndex) {
    const state = paneId === 'left' ? commanderLeftState : commanderRightState;
    const item = state.items[itemIndex];
    if (!item) return;

    const sep = isWindows ? '\\' : '/';
    const targetPath = state.path.endsWith(sep) ? state.path + item.name : state.path + sep + item.name;

    if (item.type === 'Directory') {
        loadCommanderPane(paneId, targetPath);
    } else {
        smartOpenFile(targetPath);
    }
}

function navigateCommanderParent(paneId) {
    const state = paneId === 'left' ? commanderLeftState : commanderRightState;
    const sftpInfo = parseSftpUrl(state.path);
    if (sftpInfo) {
        if (sftpInfo.remotePath === '/' || !sftpInfo.remotePath) return;
        const parts = sftpInfo.remotePath.split('/').filter(Boolean);
        if (parts.length <= 1) {
            loadCommanderPane(paneId, `sftp://${sftpInfo.connectionId}/`);
            return;
        }
        parts.pop();
        loadCommanderPane(paneId, `sftp://${sftpInfo.connectionId}/` + parts.join('/'));
        return;
    }

    const sep = isWindows ? '\\' : '/';
    const parts = state.path.split(sep).filter(Boolean);
    if (parts.length > 1) {
        parts.pop();
        const parent = isWindows ? (parts.join('\\') || 'C:\\') : ('/' + parts.join('/'));
        loadCommanderPane(paneId, parent);
    } else if (parts.length === 1 && !isWindows) {
        loadCommanderPane(paneId, '/');
    }
}

function refreshCommanderPane(paneId) {
    const state = paneId === 'left' ? commanderLeftState : commanderRightState;
    loadCommanderPane(paneId, state.path, true);
    showToast((paneId === 'left' ? 'Left Pane' : 'Right Pane') + ' refreshed', '🔄');
}

function setActivePane(paneId, event) {
    if (event && event.stopPropagation) event.stopPropagation();
    activePaneId = paneId;
    const leftPane = document.getElementById('commander-pane-left');
    const rightPane = document.getElementById('commander-pane-right');
    if (leftPane) leftPane.classList.toggle('active-pane', paneId === 'left');
    if (rightPane) rightPane.classList.toggle('active-pane', paneId === 'right');

    const state = paneId === 'left' ? commanderLeftState : commanderRightState;
    if (state && state.path) {
        currentPath = state.path;
        renderBreadcrumbs();
        updateNavButtons();
        updateAddressBarStar();
        updateCompactWindowTitle();
    }
}

function switchActivePane() {
    const nextPane = activePaneId === 'left' ? 'right' : 'left';
    setActivePane(nextPane);
    showToast('Active: ' + (nextPane === 'left' ? 'Left Pane' : 'Right Pane'), '⫴');
}

async function commanderCopy() {
    const sourceState = activePaneId === 'left' ? commanderLeftState : commanderRightState;
    const targetState = activePaneId === 'left' ? commanderRightState : commanderLeftState;
    const targetPaneId = activePaneId === 'left' ? 'right' : 'left';

    const itemsToCopy = sourceState.selectedItems.length > 0 ? sourceState.selectedItems : (sourceState.selected ? [sourceState.selected] : []);
    if (itemsToCopy.length === 0) {
        showToast('Select item(s) in active pane to copy', '⚠️');
        return;
    }

    if (sourceState.path === targetState.path) {
        showToast('Target pane is identical to source pane', '⚠️');
        return;
    }

    const sep = isWindows ? '\\' : '/';
    let successCount = 0;
    for (let i = 0; i < itemsToCopy.length; i++) {
        const item = itemsToCopy[i];
        const srcPath = item.path || (sourceState.path.endsWith(sep) ? sourceState.path + item.name : sourceState.path + sep + item.name);
        try {
            const res = await fetch('/api/files/copy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ source: srcPath, destinationDir: targetState.path })
            });
            if (res.ok) successCount++;
        } catch (err) {
            console.error(err);
        }
    }

    if (successCount > 0) {
        showToast('Copied ' + successCount + (successCount === 1 ? ' item' : ' items') + ' to ' + (targetPaneId === 'left' ? 'Left Pane' : 'Right Pane') + ' ➔', '📋');
        loadCommanderPane(targetPaneId, targetState.path);
    } else {
        showToast('Failed to copy item(s)', '❌');
    }
}

async function commanderMove() {
    const sourceState = activePaneId === 'left' ? commanderLeftState : commanderRightState;
    const targetState = activePaneId === 'left' ? commanderRightState : commanderLeftState;
    const targetPaneId = activePaneId === 'left' ? 'right' : 'left';

    const itemsToMove = sourceState.selectedItems.length > 0 ? sourceState.selectedItems : (sourceState.selected ? [sourceState.selected] : []);
    if (itemsToMove.length === 0) {
        showToast('Select item(s) in active pane to move', '⚠️');
        return;
    }

    if (sourceState.path === targetState.path) {
        showToast('Target pane is identical to source pane', '⚠️');
        return;
    }

    const sep = isWindows ? '\\' : '/';
    let successCount = 0;
    for (let i = 0; i < itemsToMove.length; i++) {
        const item = itemsToMove[i];
        const srcPath = item.path || (sourceState.path.endsWith(sep) ? sourceState.path + item.name : sourceState.path + sep + item.name);
        try {
            const res = await fetch('/api/files/move', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ source: srcPath, destinationDir: targetState.path })
            });
            if (res.ok) successCount++;
        } catch (err) {
            console.error(err);
        }
    }

    if (successCount > 0) {
        showToast('Moved ' + successCount + (successCount === 1 ? ' item' : ' items') + ' to ' + (targetPaneId === 'left' ? 'Left Pane' : 'Right Pane') + ' ➔', '📦');
        loadCommanderPane(activePaneId, sourceState.path);
        loadCommanderPane(targetPaneId, targetState.path);
    } else {
        showToast('Failed to move item(s)', '❌');
    }
}

function renderCommanderBreadcrumbs(paneId, currentPanePath) {
    const container = document.getElementById('pane-' + paneId + '-breadcrumbs');
    const pathEl = document.getElementById('pane-' + paneId + '-path');
    if (pathEl) {
        pathEl.textContent = currentPanePath || '~';
        pathEl.title = currentPanePath || '~';
    }
    if (!container) return;
    if (!currentPanePath || currentPanePath === '.') {
        container.innerHTML = '<span class="commander-crumb current">Loading...</span>';
        return;
    }

    const sftpInfo = parseSftpUrl(currentPanePath);
    if (sftpInfo) {
        let html = '';
        const session = (typeof sftpActiveSessions !== 'undefined') ? sftpActiveSessions.find(s => s.connectionId === sftpInfo.connectionId) : null;
        const serverLabel = session ? (session.name || `${session.username}@${session.host}`) : 'Remote';
        const rootPath = `sftp://${sftpInfo.connectionId}/`;
        const isAtRoot = sftpInfo.remotePath === '/' || !sftpInfo.remotePath;
        html += '<span class="commander-crumb' + (isAtRoot ? ' current' : '') + '" onclick="event.stopPropagation(); navigateCommanderCrumb(\'' + paneId + '\', \'' + escapePath(rootPath) + '\')">' +
                '<i>🌐</i> ' + escapeHtml(serverLabel) + '</span>';

        const parts = sftpInfo.remotePath.split('/').filter(function(p) { return p !== ''; });
        let accum = `sftp://${sftpInfo.connectionId}`;
        for (let i = 0; i < parts.length; i++) {
            accum += '/' + parts[i];
            const isCurrent = (i === parts.length - 1);
            html += '<span class="commander-crumb-sep">›</span>';
            html += '<span class="commander-crumb' + (isCurrent ? ' current' : '') + '" onclick="event.stopPropagation(); navigateCommanderCrumb(\'' + paneId + '\', \'' + escapePath(accum) + '\')">' +
                    escapeHtml(parts[i]) + '</span>';
        }
        container.innerHTML = html;
        container.scrollLeft = container.scrollWidth;
        return;
    }

    const sep = isWindows ? '\\' : '/';
    const parts = currentPanePath.split(sep).filter(function(p) { return p !== ''; });
    let html = '';

    const rootPath = isWindows ? (currentPanePath.slice(0, 3)) : '/';
    const rootLabel = isWindows ? rootPath : '/';
    html += '<span class="commander-crumb' + (parts.length === 0 ? ' current' : '') + '" onclick="event.stopPropagation(); navigateCommanderCrumb(\'' + paneId + '\', \'' + escapePath(rootPath) + '\')">' +
            '<i>' + (isWindows ? '💻' : '📁') + '</i> ' + escapeHtml(rootLabel) + '</span>';

    let accum = isWindows ? rootPath : '';
    for (let i = 0; i < parts.length; i++) {
        if (isWindows && i === 0 && parts[0].endsWith(':')) continue;
        accum = isWindows ? (accum.endsWith('\\') ? accum + parts[i] : accum + '\\' + parts[i]) : accum + '/' + parts[i];
        const isCurrent = (i === parts.length - 1);
        html += '<span class="commander-crumb-sep">›</span>';
        html += '<span class="commander-crumb' + (isCurrent ? ' current' : '') + '" onclick="event.stopPropagation(); navigateCommanderCrumb(\'' + paneId + '\', \'' + escapePath(accum) + '\')">' +
                escapeHtml(parts[i]) + '</span>';
    }
    container.innerHTML = html;
    container.scrollLeft = container.scrollWidth;
}

function navigateCommanderCrumb(paneId, targetPath) {
    setActivePane(paneId);
    loadCommanderPane(paneId, targetPath);
}

function handleCommanderPathBarClick(paneId, event) {
    if (event) event.stopPropagation();
    setActivePane(paneId);
    if (event && event.target && event.target.closest('.commander-crumb')) return;
    enterCommanderPathEdit(paneId);
}

function enterCommanderPathEdit(paneId) {
    const breadcrumbs = document.getElementById('pane-' + paneId + '-breadcrumbs');
    const input = document.getElementById('pane-' + paneId + '-input');
    const state = paneId === 'left' ? commanderLeftState : commanderRightState;
    if (breadcrumbs && input) {
        breadcrumbs.style.display = 'none';
        input.style.display = 'block';
        input.value = state.path || '';
        input.focus();
        input.select();
    }
}

function exitCommanderPathEdit(paneId) {
    const breadcrumbs = document.getElementById('pane-' + paneId + '-breadcrumbs');
    const input = document.getElementById('pane-' + paneId + '-input');
    if (breadcrumbs && input) {
        input.style.display = 'none';
        breadcrumbs.style.display = 'flex';
    }
}

function handleCommanderPathKeyDown(paneId, event) {
    if (event.key === 'Enter') {
        const input = document.getElementById('pane-' + paneId + '-input');
        const target = input ? input.value.trim() : '';
        exitCommanderPathEdit(paneId);
        if (target) {
            loadCommanderPane(paneId, target);
        }
    } else if (event.key === 'Escape') {
        exitCommanderPathEdit(paneId);
    }
}

function openTerminalAtActiveCommander(paneId) {
    const state = paneId === 'left' ? commanderLeftState : commanderRightState;
    if (state && state.path) {
        openTerminal(state.path);
    }
}

function openTerminalAtActivePane() {
    const state = activePaneId === 'left' ? commanderLeftState : commanderRightState;
    if (state && state.path) {
        openTerminal(state.path);
    }
}

function handleCommanderDragStart(paneId, itemIndex, event) {
    const state = paneId === 'left' ? commanderLeftState : commanderRightState;
    const item = state.items[itemIndex];
    if (!item || !event.dataTransfer) return;
    const sep = isWindows ? '\\' : '/';
    const fullPath = state.path.endsWith(sep) ? state.path + item.name : state.path + sep + item.name;
    event.dataTransfer.setData('text/plain', fullPath);
    event.dataTransfer.effectAllowed = 'copyMove';
}

function initDualPaneResizer() {
    const resizer = document.getElementById('dual-pane-resizer');
    const leftPane = document.getElementById('commander-pane-left');
    const rightPane = document.getElementById('commander-pane-right');
    const wrapper = document.getElementById('dual-pane-split-wrapper');
    if (!resizer || !leftPane || !rightPane || !wrapper) return;

    let isDragging = false;
    let startX = 0;
    let startLeftWidth = 0;

    resizer.addEventListener('mousedown', function(e) {
        e.preventDefault();
        isDragging = true;
        startX = e.clientX;
        startLeftWidth = leftPane.getBoundingClientRect().width;
        resizer.classList.add('resizing');
        document.body.style.cursor = 'col-resize';
    });

    resizer.addEventListener('dblclick', function() {
        leftPane.style.flex = '1 1 50%';
        rightPane.style.flex = '1 1 50%';
        safeStorage.removeItem('venel_commander_left_pct');
        showToast('Dual panes reset 50/50', '📐');
    });

    window.addEventListener('mousemove', function(e) {
        if (!isDragging) return;
        const totalWidth = wrapper.getBoundingClientRect().width;
        const delta = e.clientX - startX;
        let newLeftWidth = startLeftWidth + delta;
        const minWidth = 180;
        if (newLeftWidth < minWidth) newLeftWidth = minWidth;
        if (newLeftWidth > totalWidth - minWidth) newLeftWidth = totalWidth - minWidth;
        const leftPct = (newLeftWidth / totalWidth) * 100;
        leftPane.style.flex = '0 0 ' + leftPct + '%';
        rightPane.style.flex = '1 1 ' + (100 - leftPct) + '%';
        safeStorage.setItem('venel_commander_left_pct', leftPct);
    });

    window.addEventListener('mouseup', function() {
        if (isDragging) {
            isDragging = false;
            resizer.classList.remove('resizing');
            document.body.style.cursor = '';
        }
    });

    const savedPct = safeStorage.getItem('venel_commander_left_pct');
    if (savedPct) {
        const pct = parseFloat(savedPct);
        if (pct >= 20 && pct <= 80) {
            leftPane.style.flex = '0 0 ' + pct + '%';
            rightPane.style.flex = '1 1 ' + (100 - pct) + '%';
        }
    }
}


// ══════════════════════════════════════════════════════════