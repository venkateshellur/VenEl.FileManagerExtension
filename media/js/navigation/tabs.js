/**
 * VenEl File Manager - Multi-Tab Strip
 * Tab creation, switching, closing, and keyboard shortcuts.
 */
// ══════════════════════════════════════════════════════════
let tabs = [];
let activeTabId = null;
let contextMenuTabId = null;

function getTabTitleForPath(p) {
    if (!p || p === '.') return 'Folder';
    const clean = p.replace(/[\\/]+$/, '');
    if (!clean) return p || 'Root';
    const sep = clean.includes('\\') ? '\\' : '/';
    const parts = clean.split(sep).filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : clean;
}

function renderTabs() {
    const container = document.getElementById('tabs-container');
    if (!container) return;

    let html = '';
    for (let i = 0; i < tabs.length; i++) {
        const tab = tabs[i];
        const isActive = (tab.id === activeTabId);
        const title = tab.title || getTabTitleForPath(tab.path);
        const fullPath = tab.path || '';

        let icon = '📁';
        if (fullPath === '/' || /^[a-zA-Z]:\\?$/.test(fullPath)) icon = isWindows ? '💻' : '📁';
        else if (systemRoots.some(function(r) { return r.type === 'Home' && r.path === fullPath; })) icon = '🏠';

        html += '<div class="tab-item' + (isActive ? ' active' : '') + '" ' +
                'data-tab-id="' + tab.id + '" ' +
                'onclick="switchToTab(\'' + tab.id + '\')" ' +
                'onauxclick="handleTabAuxClick(event, \'' + tab.id + '\')" ' +
                'oncontextmenu="handleTabContextMenu(event, \'' + tab.id + '\')" ' +
                'title="' + escapeHtml(fullPath) + (i < 9 ? ' (Alt+' + (i + 1) + ')' : '') + '">' +
                '<span class="tab-icon">' + icon + '</span>' +
                '<span class="tab-title">' + escapeHtml(title) + '</span>' +
                (tabs.length > 1 ? '<span class="tab-close" onclick="closeTab(\'' + tab.id + '\', event)" title="Close tab (Ctrl+W)">✕</span>' : '') +
                '</div>';
    }
    container.innerHTML = html;
}

function switchToTab(tabId) {
    if (activeTabId === tabId) return;

    // 1. Save current active tab state
    const currentTab = tabs.find(function(t) { return t.id === activeTabId; });
    if (currentTab) {
        currentTab.history = [...navHistory];
        currentTab.historyIndex = navHistoryIndex;
        currentTab.searchQuery = document.getElementById('search') ? document.getElementById('search').value : '';
        currentTab.sort = { ...currentSort };
    }

    // 2. Set new active tab
    activeTabId = tabId;
    const nextTab = tabs.find(function(t) { return t.id === tabId; });
    if (!nextTab) return;

    // 3. Restore target tab state
    navHistory = Array.isArray(nextTab.history) && nextTab.history.length > 0 ? [...nextTab.history] : [nextTab.path];
    navHistoryIndex = typeof nextTab.historyIndex === 'number' ? nextTab.historyIndex : navHistory.length - 1;
    updateNavButtons();

    if (nextTab.sort) {
        currentSort = { ...nextTab.sort };
    }

    const searchInput = document.getElementById('search');
    if (searchInput) {
        searchInput.value = nextTab.searchQuery || '';
        const clearBtn = document.getElementById('search-clear-btn');
        if (clearBtn) clearBtn.style.display = searchInput.value ? 'block' : 'none';
    }

    renderTabs();
    saveTabsState();

    // 4. Load directory for this tab
    loadFiles(nextTab.path);
}

function addNewTab(initialPath) {
    const targetPath = initialPath || currentPath || '.';
    const newId = 'tab_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const newTab = {
        id: newId,
        title: getTabTitleForPath(targetPath),
        path: targetPath,
        history: [targetPath],
        historyIndex: 0,
        sort: { field: 'name', asc: true },
        searchQuery: ''
    };
    tabs.push(newTab);
    renderTabs();
    switchToTab(newId);

    const container = document.getElementById('tabs-container');
    if (container) {
        setTimeout(function() { container.scrollLeft = container.scrollWidth; }, 40);
    }
}

function closeTab(tabId, e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    if (tabs.length <= 1) {
        showToast('Cannot close the only open tab', 'ℹ️');
        return;
    }
    const idx = tabs.findIndex(function(t) { return t.id === tabId; });
    if (idx === -1) return;

    const wasActive = (activeTabId === tabId);
    tabs.splice(idx, 1);

    if (wasActive) {
        const nextIdx = Math.max(0, idx - 1);
        const nextTab = tabs[nextIdx];
        activeTabId = nextTab.id;
        navHistory = Array.isArray(nextTab.history) ? [...nextTab.history] : [nextTab.path];
        navHistoryIndex = typeof nextTab.historyIndex === 'number' ? nextTab.historyIndex : navHistory.length - 1;
        updateNavButtons();
        renderTabs();
        saveTabsState();
        loadFiles(nextTab.path);
    } else {
        renderTabs();
        saveTabsState();
    }
}

function closeCurrentTab() {
    closeTab(activeTabId);
}

function handleTabAuxClick(e, tabId) {
    if (e.button === 1) {
        e.preventDefault();
        e.stopPropagation();
        closeTab(tabId);
    }
}

function handleItemAuxClick(e, name, isDir) {
    if (e.button === 1 && isDir) {
        e.preventDefault();
        e.stopPropagation();
        const sep = isWindows ? '\\' : '/';
        const targetPath = (selectedItem && selectedItem.path) ? selectedItem.path : (currentPath.endsWith(sep) ? currentPath + name : currentPath + sep + name);
        addNewTab(targetPath);
        showToast('Opened folder in new tab', '🗂️');
    }
}

function handleTabContextMenu(e, tabId) {
    e.preventDefault();
    e.stopPropagation();
    contextMenuTabId = tabId;
    hideContextMenu();

    const menu = document.getElementById('tab-context-menu');
    if (!menu) return;

    const tab = tabs.find(function(t) { return t.id === tabId; });
    const revealLabel = document.getElementById('ctx-tab-reveal-label');
    if (revealLabel) revealLabel.textContent = isWindows ? 'Reveal in File Explorer' : 'Reveal in Finder';

    menu.style.display = 'flex';
    const menuWidth = 200;
    const menuHeight = 250;
    const maxX = window.innerWidth - menuWidth - 10;
    const maxY = window.innerHeight - menuHeight - 10;
    menu.style.left = Math.min(e.clientX, maxX) + 'px';
    menu.style.top = Math.min(e.clientY, maxY) + 'px';
}

function duplicateTargetTab() {
    hideContextMenu();
    const tab = tabs.find(function(t) { return t.id === contextMenuTabId; }) || tabs.find(function(t) { return t.id === activeTabId; });
    if (tab) {
        addNewTab(tab.path);
    }
}

function openTerminalAtTargetTab() {
    hideContextMenu();
    const tab = tabs.find(function(t) { return t.id === contextMenuTabId; }) || tabs.find(function(t) { return t.id === activeTabId; });
    if (!tab) return;
    if (window.vscode) {
        window.vscode.postMessage({ command: 'openTerminal', path: tab.path });
    } else {
        fetch('/api/actions/terminal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: tab.path })
        });
    }
    showToast('Opening terminal...', '💻');
}

function revealTargetTabInOS() {
    hideContextMenu();
    const tab = tabs.find(function(t) { return t.id === contextMenuTabId; }) || tabs.find(function(t) { return t.id === activeTabId; });
    if (!tab) return;
    if (window.vscode) {
        window.vscode.postMessage({ command: 'revealInOS', path: tab.path });
    } else {
        fetch('/api/actions/reveal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: tab.path })
        });
    }
}

function copyTargetTabPath() {
    hideContextMenu();
    const tab = tabs.find(function(t) { return t.id === contextMenuTabId; }) || tabs.find(function(t) { return t.id === activeTabId; });
    if (tab && navigator.clipboard) {
        navigator.clipboard.writeText(tab.path);
        showToast('Path copied to clipboard', '📋');
    }
}

function closeTargetTab() {
    hideContextMenu();
    if (contextMenuTabId) {
        closeTab(contextMenuTabId);
    } else {
        closeCurrentTab();
    }
}

function closeOtherTabs() {
    hideContextMenu();
    const targetId = contextMenuTabId || activeTabId;
    const targetTab = tabs.find(function(t) { return t.id === targetId; });
    if (!targetTab) return;
    tabs = [targetTab];
    activeTabId = targetTab.id;
    navHistory = Array.isArray(targetTab.history) ? [...targetTab.history] : [targetTab.path];
    navHistoryIndex = typeof targetTab.historyIndex === 'number' ? targetTab.historyIndex : navHistory.length - 1;
    updateNavButtons();
    renderTabs();
    saveTabsState();
    loadFiles(targetTab.path);
    showToast('Closed other tabs', 'ℹ️');
}

function closeTabsToRight() {
    hideContextMenu();
    const targetId = contextMenuTabId || activeTabId;
    const idx = tabs.findIndex(function(t) { return t.id === targetId; });
    if (idx === -1 || idx >= tabs.length - 1) return;
    tabs = tabs.slice(0, idx + 1);
    if (!tabs.some(function(t) { return t.id === activeTabId; })) {
        activeTabId = targetId;
        const targetTab = tabs[idx];
        navHistory = Array.isArray(targetTab.history) ? [...targetTab.history] : [targetTab.path];
        navHistoryIndex = typeof targetTab.historyIndex === 'number' ? targetTab.historyIndex : navHistory.length - 1;
        updateNavButtons();
        loadFiles(targetTab.path);
    }
    renderTabs();
    saveTabsState();
    showToast('Closed tabs to the right', 'ℹ️');
}

function cycleTabs(direction = 1) {
    if (tabs.length <= 1) return;
    const currentIdx = tabs.findIndex(function(t) { return t.id === activeTabId; });
    if (currentIdx === -1) return;
    let nextIdx = (currentIdx + direction) % tabs.length;
    if (nextIdx < 0) nextIdx = tabs.length - 1;
    switchToTab(tabs[nextIdx].id);
}

function openSelectedItemInNewTab() {
    hideContextMenu();
    if (!selectedItem) return;
    const sep = isWindows ? '\\' : '/';
    const targetPath = (selectedItem && selectedItem.path) ? selectedItem.path : (currentPath.endsWith(sep) ? currentPath + selectedItem.name : currentPath + sep + selectedItem.name);
    addNewTab(targetPath);
    showToast('Opened folder in new tab', '🗂️');
}

function updateActiveTabAfterLoad(path) {
    const activeTab = tabs.find(function(t) { return t.id === activeTabId; });
    if (activeTab) {
        activeTab.path = path;
        activeTab.title = getTabTitleForPath(path);
        renderTabs();
        saveTabsState();
    }
}

function saveTabsState() {
    try {
        const saved = tabs.map(function(t) {
            return {
                id: t.id,
                title: t.title,
                path: t.path,
                sort: t.sort
            };
        });
        safeStorage.setItem('venel_tabs_v1', JSON.stringify({
            activeTabId: activeTabId,
            tabs: saved
        }));
    } catch (e) {
        console.warn('Failed to save tabs state', e);
    }
}

function loadTabsState() {
    try {
        const raw = safeStorage.getItem('venel_tabs_v1');
        if (raw) {
            const data = JSON.parse(raw);
            if (Array.isArray(data.tabs) && data.tabs.length > 0) {
                tabs = data.tabs.map(function(t) {
                    return {
                        id: t.id,
                        title: t.title || getTabTitleForPath(t.path),
                        path: t.path,
                        history: [t.path],
                        historyIndex: 0,
                        sort: t.sort || { field: 'name', asc: true },
                        searchQuery: ''
                    };
                });
                activeTabId = tabs.some(function(t) { return t.id === data.activeTabId; }) ? data.activeTabId : tabs[0].id;
                return true;
            }
        }
    } catch (e) {
        console.warn('Failed to restore tabs state', e);
    }
    return false;
}

// Initialize Tabs
if (!loadTabsState()) {
    tabs = [{
        id: 'tab_init',
        title: 'Loading...',
        path: '.',
        history: ['.'],
        historyIndex: 0,
        sort: { field: 'name', asc: true },
        searchQuery: ''
    }];
    activeTabId = 'tab_init';
}
try { renderTabs(); } catch (e) {}

// Mousewheel horizontal scroll on tabs bar
const tabsBarEl = document.getElementById('tabs-bar');
if (tabsBarEl) {
    tabsBarEl.addEventListener('wheel', function(e) {
        if (e.deltaY !== 0) {
            e.preventDefault();
            tabsBarEl.scrollLeft += e.deltaY;
        }
    }, { passive: false });
}
