let currentPath = '.';
let currentItems = [];
let displayedItems = [];
let selectedItem = null;
let selectedItems = [];
let lastSelectedName = null;
let activePreviewPath = null;
let activePreviewIsDir = false;
let typeAheadBuffer = '';
let typeAheadTimer = null;
let activeBatchTab = 'replace';
let batchGeneratedNames = [];
let selectedPropPath = '';
let clipboard = null;
let isWindows = false;
const isMac = typeof navigator !== 'undefined' && (/Mac/i.test(navigator.platform || '') || /Mac/i.test(navigator.userAgent || ''));
const tabShortcutLabel = isMac ? '⌘T' : 'Ctrl+T';
let systemRoots = [];

// ══════════════════════════════════════════════════════════
// 🛡️ SAFE STORAGE WRAPPER (Prevents DOMException in sandboxed iframes)
// ══════════════════════════════════════════════════════════
const safeStorage = {
    _mem: {},
    getItem: function(key) {
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                return window.localStorage.getItem(key);
            }
        } catch (e) {}
        return Object.prototype.hasOwnProperty.call(this._mem, key) ? this._mem[key] : null;
    },
    setItem: function(key, val) {
        const strVal = String(val);
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                window.localStorage.setItem(key, strVal);
            }
        } catch (e) {}
        this._mem[key] = strVal;
    },
    removeItem: function(key) {
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                window.localStorage.removeItem(key);
            }
        } catch (e) {}
        delete this._mem[key];
    }
};

// ══════════════════════════════════════════════════════════
// 💼 DYNAMIC HOST IDE & WORKING DIRECTORY STATE
// ══════════════════════════════════════════════════════════
let detectedIdeName = (function() {
    try {
        const p = new URLSearchParams(window.location.search).get('ideName');
        if (p) return p;
    } catch {}
    return 'IDE';
})();
let activeWorkingDirectory = safeStorage.getItem('venel_working_directory') || null;
let ideWorkspaceFolders = [];
let idePrimaryWorkspace = null;

// Navigation History Stack
let navHistory = [];
let navHistoryIndex = -1;

// Sorting State
let currentSort = { field: 'name', asc: true };

// ══════════════════════════════════════════════════════════
// 🧭 DESKTOP-CLASS MENU BAR LOGIC (macOS Finder / Windows Explorer)
// ══════════════════════════════════════════════════════════
let activeMenuBarId = null;

function toggleMenuBar(menuName, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    if (activeMenuBarId === menuName) {
        closeAllMenus();
    } else {
        openMenuBar(menuName);
    }
}

function openMenuBar(menuName) {
    closeAllMenus();
    activeMenuBarId = menuName;
    const item = document.getElementById('menu-' + menuName);
    if (item) item.classList.add('open');
    syncMenuShortcuts();
    updateViewMenuChecks();
}

function handleMenuHover(menuName) {
    // Hover scrubbing only when a menu is already open (native macOS / Windows behavior)
    if (activeMenuBarId && activeMenuBarId !== menuName) {
        openMenuBar(menuName);
    }
}

function closeAllMenus() {
    activeMenuBarId = null;
    document.querySelectorAll('.menubar-item.open').forEach(function(el) {
        el.classList.remove('open');
    });
}

function menuAction(fn) {
    closeAllMenus();
    if (typeof fn === 'function') {
        try {
            fn();
        } catch (e) {
            console.error('Menu action error:', e);
        }
    }
}

function setMenuEntryDisabled(id, disabled) {
    const el = document.getElementById(id);
    if (el) {
        if (disabled) {
            el.classList.add('disabled');
            el.setAttribute('aria-disabled', 'true');
        } else {
            el.classList.remove('disabled');
            el.removeAttribute('aria-disabled');
        }
    }
}

function syncMenuShortcuts() {
    const isMacPlatform = typeof isMac !== 'undefined' ? isMac : /Mac/i.test(navigator.platform || navigator.userAgent);
    document.querySelectorAll('.menu-shortcut[data-shortcut-mac]').forEach(function(el) {
        const text = isMacPlatform ? el.getAttribute('data-shortcut-mac') : el.getAttribute('data-shortcut-win');
        if (text) el.textContent = text;
    });

    const btnBack = document.getElementById('btn-back');
    if (btnBack) btnBack.title = isMacPlatform ? 'Back (⌘[ or Delete)' : 'Back (Alt+Left or Backspace)';
    const btnForward = document.getElementById('btn-forward');
    if (btnForward) btnForward.title = isMacPlatform ? 'Forward (⌘])' : 'Forward (Alt+Right)';
    const btnUp = document.getElementById('btn-up');
    if (btnUp) btnUp.title = isMacPlatform ? 'Enclosing Folder (⌘↑)' : 'Up One Level (Alt+Up)';
}

function updateViewMenuChecks() {
    const currentV = typeof currentViewMode !== 'undefined' ? currentViewMode : 'grid';
    ['grid', 'grid-small', 'details', 'list', 'large', 'compact'].forEach(function(v) {
        const chk = document.getElementById('menu-chk-' + v);
        if (chk) chk.textContent = currentV === v ? '✓' : '';
    });

    const previewPane = document.getElementById('preview-pane');
    const chkPreview = document.getElementById('menu-chk-preview');
    if (chkPreview && previewPane) {
        chkPreview.textContent = !previewPane.classList.contains('collapsed') ? '✓' : '';
    }

    const bookmarksBar = document.getElementById('bookmarks-bar');
    const chkBookmarks = document.getElementById('menu-chk-bookmarks');
    if (chkBookmarks && bookmarksBar) {
        chkBookmarks.textContent = bookmarksBar.style.display !== 'none' ? '✓' : '';
    }

    const sidebar = document.getElementById('quick-access-sidebar');
    const chkSidebar = document.getElementById('menu-chk-sidebar');
    if (chkSidebar && sidebar) {
        chkSidebar.textContent = !sidebar.classList.contains('collapsed') ? '✓' : '';
    }

    const quickFilterBar = document.getElementById('quick-filter-bar');
    const chkFilter = document.getElementById('menu-chk-quick-filter');
    if (chkFilter && quickFilterBar) {
        chkFilter.textContent = quickFilterBar.style.display !== 'none' ? '✓' : '';
    }

    const chkHidden = document.getElementById('menu-chk-hidden');
    if (chkHidden) {
        chkHidden.textContent = (typeof showHiddenFiles !== 'undefined' && showHiddenFiles) ? '✓' : '';
    }

    const chkCompactBars = document.getElementById('menu-chk-compact-bars');
    if (chkCompactBars) {
        chkCompactBars.textContent = (typeof isCompactBars !== 'undefined' && isCompactBars) ? '✓' : '';
    }

    const chkDual = document.getElementById('menu-chk-dualpane');
    if (chkDual) {
        chkDual.textContent = (typeof isDualPane !== 'undefined' && isDualPane) ? '✓' : '';
    }
    const btnDual = document.getElementById('btn-toggle-dual-pane');
    if (btnDual) {
        btnDual.classList.toggle('active', typeof isDualPane !== 'undefined' && isDualPane);
    }

    if (typeof currentSort !== 'undefined' && currentSort.field) {
        ['name', 'size', 'modified', 'type'].forEach(function(s) {
            const chkSort = document.getElementById('menu-chk-sort-' + s);
            if (chkSort) {
                if (currentSort.field === s) {
                    chkSort.textContent = currentSort.asc ? '▲' : '▼';
                } else {
                    chkSort.textContent = '';
                }
            }
        });
    }

    const currentTheme = getThemeMode();
    ['auto', 'dark', 'light', 'high-contrast'].forEach(function(m) {
        const chk = document.getElementById('menu-chk-theme-' + m);
        if (chk) chk.textContent = currentTheme === m ? '✓' : '';
    });
}

// ══════════════════════════════════════════════════════════
// 🎨 DYNAMIC IDE & SYSTEM THEME ENGINE
// ══════════════════════════════════════════════════════════
const _urlParams = (typeof window !== 'undefined' && window.location && window.location.search) ? new URLSearchParams(window.location.search) : null;
const _urlIdeTheme = _urlParams ? _urlParams.get('ideTheme') : null;

let cachedIdeTheme = (_urlIdeTheme && ['dark', 'light', 'high-contrast', 'high-contrast-light'].includes(_urlIdeTheme)) 
    ? { themeKind: _urlIdeTheme } 
    : null;

let currentThemeMode = (function() {
    try {
        const stored = safeStorage.getItem('venel_theme_mode');
        if (stored && ['auto', 'dark', 'light', 'high-contrast'].includes(stored)) {
            return stored;
        }
        return 'auto';
    } catch (e) {
        return 'auto';
    }
})();

function getThemeMode() {
    return currentThemeMode;
}

function setThemeMode(mode) {
    if (!['auto', 'dark', 'light', 'high-contrast'].includes(mode)) mode = 'auto';
    currentThemeMode = mode;
    safeStorage.setItem('venel_theme_mode', mode);
    applyTheme();
    updateViewMenuChecks();
    
    const labelMap = {
        'auto': 'Auto (Follow IDE / System)',
        'dark': 'Dark Theme',
        'light': 'Light Theme',
        'high-contrast': 'High Contrast'
    };
    const iconMap = {
        'auto': '🎨',
        'dark': '🌙',
        'light': '☀️',
        'high-contrast': '👁️'
    };
    if (typeof showToast === 'function') {
        showToast('Theme set to: ' + (labelMap[mode] || mode), iconMap[mode] || '🎨');
    }
}

function cycleThemeMode() {
    const modes = ['auto', 'dark', 'light', 'high-contrast'];
    const idx = modes.indexOf(currentThemeMode);
    const nextMode = modes[(idx + 1) % modes.length];
    setThemeMode(nextMode);
}

function applyTheme() {
    const body = document.body;
    if (!body) return;

    let effectiveTheme = 'dark';
    if (currentThemeMode === 'auto') {
        if (cachedIdeTheme && cachedIdeTheme.themeKind) {
            effectiveTheme = cachedIdeTheme.themeKind;
        } else if (_urlIdeTheme) {
            effectiveTheme = _urlIdeTheme;
        } else {
            // Default to dark for Antigravity & VS Code developer environment.
            // Never let macOS OS-level light appearance override an IDE dark environment.
            effectiveTheme = 'dark';
        }
    } else {
        effectiveTheme = currentThemeMode;
    }

    body.classList.remove('vscode-light', 'vscode-dark', 'vscode-high-contrast', 'vscode-high-contrast-light', 'theme-light', 'theme-dark', 'theme-high-contrast');

    if (effectiveTheme === 'light') {
        body.setAttribute('data-theme', 'light');
        body.classList.add('vscode-light', 'theme-light');
    } else if (effectiveTheme === 'high-contrast' || effectiveTheme === 'high-contrast-light') {
        body.setAttribute('data-theme', 'high-contrast');
        body.classList.add(effectiveTheme === 'high-contrast-light' ? 'vscode-high-contrast-light' : 'vscode-high-contrast', 'theme-high-contrast');
    } else {
        body.setAttribute('data-theme', 'dark');
        body.classList.add('vscode-dark', 'theme-dark');
    }

    if (currentThemeMode === 'auto' && cachedIdeTheme && cachedIdeTheme.vars) {
        for (const [k, v] of Object.entries(cachedIdeTheme.vars)) {
            if (v) {
                document.documentElement.style.setProperty(k, v);
            }
        }
    } else if (currentThemeMode !== 'auto') {
        const knownVars = [
            '--vscode-editor-background', '--vscode-editor-foreground',
            '--vscode-sideBar-background', '--vscode-sideBar-foreground',
            '--vscode-sideBar-border', '--vscode-focusBorder',
            '--vscode-list-hoverBackground', '--vscode-list-activeSelectionBackground',
            '--vscode-input-background', '--vscode-input-foreground',
            '--vscode-editorWidget-background', '--vscode-editorWidget-border',
            '--vscode-menu-background', '--vscode-menu-foreground',
            '--vscode-menu-selectionBackground', '--vscode-editorGroupHeader-tabsBackground',
            '--vscode-tab-activeBackground', '--vscode-tab-activeForeground',
            '--vscode-descriptionForeground',
            '--vscode-scrollbarSlider-background',
            '--vscode-scrollbarSlider-hoverBackground',
            '--vscode-scrollbarSlider-activeBackground'
        ];
        knownVars.forEach(v => document.documentElement.style.removeProperty(v));
    }

    const themeBtnIcon = document.getElementById('theme-btn-icon');
    const themeBtn = document.getElementById('btn-toggle-theme');
    if (themeBtnIcon) {
        if (currentThemeMode === 'auto') {
            themeBtnIcon.textContent = effectiveTheme === 'light' ? '☀️' : (effectiveTheme.startsWith('high-contrast') ? '👁️' : '🌓');
            if (themeBtn) themeBtn.title = 'Theme: Auto (' + effectiveTheme + ') - Click to cycle';
        } else if (currentThemeMode === 'light') {
            themeBtnIcon.textContent = '☀️';
            if (themeBtn) themeBtn.title = 'Theme: Light - Click to cycle';
        } else if (currentThemeMode === 'high-contrast') {
            themeBtnIcon.textContent = '👁️';
            if (themeBtn) themeBtn.title = 'Theme: High Contrast - Click to cycle';
        } else {
            themeBtnIcon.textContent = '🌙';
            if (themeBtn) themeBtn.title = 'Theme: Dark - Click to cycle';
        }
    }
}

function initTheme() {
    applyTheme();

    window.addEventListener('message', function(event) {
        if (!event.data) return;
        if (event.data.command === 'ide-theme-changed' || event.data.command === 'ide-info') {
            if (event.data.themeKind || event.data.vars) {
                cachedIdeTheme = event.data;
                if (currentThemeMode === 'auto') {
                    applyTheme();
                    updateViewMenuChecks();
                }
            }
            if (event.data.ideName || event.data.workspaceFolders) {
                updateIdeEnvironmentInfo(event.data.ideName, event.data.workspaceFolders, event.data.primaryWorkspace);
            }
        }
    });

    try {
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ command: 'request-ide-theme' }, '*');
            setTimeout(function() {
                try { window.parent.postMessage({ command: 'request-ide-theme' }, '*'); } catch (e) {}
            }, 150);
            setTimeout(function() {
                try { window.parent.postMessage({ command: 'request-ide-theme' }, '*'); } catch (e) {}
            }, 600);
        }
    } catch (e) {}

    if (typeof window !== 'undefined' && window.matchMedia) {
        const mediaDark = window.matchMedia('(prefers-color-scheme: dark)');
        if (mediaDark.addEventListener) {
            mediaDark.addEventListener('change', function() {
                if (currentThemeMode === 'auto' && !cachedIdeTheme) {
                    applyTheme();
                    updateViewMenuChecks();
                }
            });
        }
    }
}
initTheme();

function toggleBookmarksBar() {
    const bar = document.getElementById('bookmarks-bar');
    if (!bar) return;
    const isHidden = bar.style.display === 'none';
    bar.style.display = isHidden ? 'flex' : 'none';
    updateViewMenuChecks();
}

function toggleQuickFilterBar() {
    const bar = document.getElementById('quick-filter-bar');
    if (!bar) return;
    const isHidden = bar.style.display === 'none';
    bar.style.display = isHidden ? 'flex' : 'none';
    safeStorage.setItem('venel_show_quick_filter', isHidden ? 'true' : 'false');
    updateViewMenuChecks();
}

let showHiddenFiles = safeStorage.getItem('venel_show_hidden') === 'true';

function toggleShowHiddenFiles() {
    showHiddenFiles = !showHiddenFiles;
    safeStorage.setItem('venel_show_hidden', showHiddenFiles ? 'true' : 'false');
    updateHiddenFilesUI();
    updateViewMenuChecks();
    updateQuickFilterCounts();
    applyFilterAndRender();
    showToast(showHiddenFiles ? 'Hidden files visible' : 'Hidden files hidden', '👁️‍🗨️');
}

function updateHiddenFilesUI() {
    const btn = document.getElementById('btn-toggle-hidden');
    const label = document.getElementById('hidden-files-label');
    if (btn) {
        if (showHiddenFiles) btn.classList.add('active');
        else btn.classList.remove('active');
    }
    if (label) {
        label.textContent = showHiddenFiles ? 'Hidden: On' : 'Hidden: Off';
    }
}

function initQuickFilterAndHiddenFiles() {
    updateHiddenFilesUI();
    const showFilterBar = safeStorage.getItem('venel_show_quick_filter') !== 'false';
    const bar = document.getElementById('quick-filter-bar');
    if (bar) bar.style.display = showFilterBar ? 'flex' : 'none';
}

function openSelectedFileInEditor() {
    if (selectedItem) {
        const sep = isWindows ? '\\' : '/';
        const fullPath = selectedItem.path || (currentPath.endsWith(sep) ? currentPath + selectedItem.name : currentPath + sep + selectedItem.name);
        if (selectedItem.type === 'Directory') {
            navigateTo(fullPath);
        } else {
            openSelectedItemInEditor(fullPath);
        }
    }
}

function triggerSelectedDecompile() {
    if (!selectedItem || selectedItem.type === 'Directory') return;
    toggleQuickLook();
}

function triggerSelectedExport() {
    if (!selectedItem || selectedItem.type === 'Directory') return;
    const sep = isWindows ? '\\' : '/';
    const fullPath = selectedItem.path || (currentPath.endsWith(sep) ? currentPath + selectedItem.name : currentPath + sep + selectedItem.name);
    if (typeof showExportProjectModal === 'function') {
        showExportProjectModal('', fullPath);
    }
}
// 🗂️ MULTI-TAB BROWSING STATE & MANAGEMENT
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

// ══════════════════════════════════════════════════════════
// 🧭 NAVIGATION & HISTORY
// ══════════════════════════════════════════════════════════
function navigateTo(targetPath, isHistoryAction = false) {
    closePathDropdown();
    if (isDualPane) {
        loadCommanderPane(activePaneId, targetPath, isHistoryAction);
        return;
    }
    if (!isHistoryAction && targetPath) {
        // If user branched from previous history index, truncate forward history
        if (navHistoryIndex >= 0 && navHistoryIndex < navHistory.length - 1) {
            navHistory = navHistory.slice(0, navHistoryIndex + 1);
        }
        if (navHistory[navHistory.length - 1] !== targetPath) {
            navHistory.push(targetPath);
            navHistoryIndex = navHistory.length - 1;
        }
        updateNavButtons();
    }
    const activeTab = tabs.find(function(t) { return t.id === activeTabId; });
    if (activeTab) {
        activeTab.history = [...navHistory];
        activeTab.historyIndex = navHistoryIndex;
    }
    loadFiles(targetPath);
}

function goBack() {
    if (isDualPane) {
        const state = activePaneId === 'left' ? commanderLeftState : commanderRightState;
        if (state && state.history && state.historyIndex > 0) {
            state.historyIndex--;
            updateNavButtons();
            loadCommanderPane(activePaneId, state.history[state.historyIndex], true);
        }
        return;
    }
    if (navHistoryIndex > 0) {
        navHistoryIndex--;
        updateNavButtons();
        loadFiles(navHistory[navHistoryIndex]);
    }
}

function goForward() {
    if (isDualPane) {
        const state = activePaneId === 'left' ? commanderLeftState : commanderRightState;
        if (state && state.history && state.historyIndex < state.history.length - 1) {
            state.historyIndex++;
            updateNavButtons();
            loadCommanderPane(activePaneId, state.history[state.historyIndex], true);
        }
        return;
    }
    if (navHistoryIndex < navHistory.length - 1) {
        navHistoryIndex++;
        updateNavButtons();
        loadFiles(navHistory[navHistoryIndex]);
    }
}

function canNavigateBack() {
    if (isDualPane) {
        const state = activePaneId === 'left' ? commanderLeftState : commanderRightState;
        return !!(state && state.history && state.historyIndex > 0);
    }
    return navHistoryIndex > 0;
}

function canNavigateForward() {
    if (isDualPane) {
        const state = activePaneId === 'left' ? commanderLeftState : commanderRightState;
        return !!(state && state.history && state.historyIndex < state.history.length - 1);
    }
    return navHistoryIndex < navHistory.length - 1;
}

function handleNativeBackOrUp(preferUp) {
    if (preferUp) {
        goUp();
        return;
    }
    if (canNavigateBack()) {
        goBack();
    } else {
        goUp();
    }
}

function updateNavButtons() {
    const btnBack = document.getElementById('btn-back');
    const btnForward = document.getElementById('btn-forward');
    const canBack = canNavigateBack();
    const canForward = canNavigateForward();
    if (btnBack) btnBack.disabled = !canBack;
    if (btnForward) btnForward.disabled = !canForward;
    setMenuEntryDisabled('menu-go-back', !canBack);
    setMenuEntryDisabled('menu-go-forward', !canForward);
}

function goUp() {
    if (isDualPane) {
        navigateCommanderParent(activePaneId);
        return;
    }
    if (!currentPath || currentPath === '.') return;

    const sftpInfo = parseSftpUrl(currentPath);
    if (sftpInfo) {
        if (sftpInfo.remotePath === '/' || !sftpInfo.remotePath) return;
        const parts = sftpInfo.remotePath.split('/').filter(function(p) { return p !== ''; });
        if (parts.length <= 1) {
            navigateTo(`sftp://${sftpInfo.connectionId}/`);
            return;
        }
        parts.pop();
        navigateTo(`sftp://${sftpInfo.connectionId}/` + parts.join('/'));
        return;
    }

    const sep = isWindows ? '\\' : '/';
    const parts = currentPath.split(sep).filter(function(p) { return p !== ''; });
    if (parts.length <= 1) {
        navigateTo(isWindows ? parts[0] + '\\' : '/');
        return;
    }
    parts.pop();
    const parent = isWindows ? (parts.join('\\') + (parts.length === 1 ? '\\' : '')) : ('/' + parts.join('/'));
    navigateTo(parent);
}

function goHome() {
    if (activeWorkingDirectory) {
        navigateTo(activeWorkingDirectory);
        return;
    }
    const homeRoot = systemRoots.find(function(r) { return r.type === 'Home'; });
    navigateTo(homeRoot ? homeRoot.path : '.');
}

function quickNav(name) {
    const match = systemRoots.find(function(r) { return r.type === name || r.name.toLowerCase().includes(name.toLowerCase()); });
    if (match) {
        navigateTo(match.path);
    } else {
        goHome();
    }
}

// ══════════════════════════════════════════════════════════
// 🍞 INTERACTIVE BREADCRUMBS
// ══════════════════════════════════════════════════════════
function renderBreadcrumbs() {
    const container = document.getElementById('path-breadcrumbs');
    if (!container) return;
    if (!currentPath || currentPath === '.') {
        container.innerHTML = '<span class="crumb current">Loading...</span>';
        return;
    }

    const sftpInfo = parseSftpUrl(currentPath);
    if (sftpInfo) {
        let html = '';
        const session = sftpActiveSessions.find(s => s.connectionId === sftpInfo.connectionId);
        const serverLabel = session ? (session.name || `${session.username}@${session.host}`) : 'SFTP Remote';
        const rootPath = `sftp://${sftpInfo.connectionId}/`;
        const isAtRoot = sftpInfo.remotePath === '/' || !sftpInfo.remotePath;
        html += '<span class="crumb' + (isAtRoot ? ' current' : '') + '" onclick="event.stopPropagation(); navigateTo(\'' + escapePath(rootPath) + '\')">' +
                '<i>🌐</i> ' + escapeHtml(serverLabel) + '</span>';

        const parts = sftpInfo.remotePath.split('/').filter(function(p) { return p !== ''; });
        let accum = `sftp://${sftpInfo.connectionId}`;
        for (let i = 0; i < parts.length; i++) {
            accum += '/' + parts[i];
            const isCurrent = (i === parts.length - 1);
            html += '<span class="crumb-sep">›</span>';
            html += '<span class="crumb' + (isCurrent ? ' current' : '') + '" onclick="event.stopPropagation(); navigateTo(\'' + escapePath(accum) + '\')">' +
                    escapeHtml(parts[i]) + '</span>';
        }
        container.innerHTML = html;
        updateCompactWindowTitle();
        return;
    }

    const sep = isWindows ? '\\' : '/';
    const parts = currentPath.split(sep).filter(function(p) { return p !== ''; });
    let html = '';

    const rootPath = isWindows ? (currentPath.slice(0, 3)) : '/';
    const rootLabel = isWindows ? rootPath : '/ (Root)';
    html += '<span class="crumb' + (parts.length === 0 ? ' current' : '') + '" onclick="event.stopPropagation(); navigateTo(\'' + escapePath(rootPath) + '\')" ondragover="handleBreadcrumbDragOver(event, \'' + escapePath(rootPath) + '\')" ondragleave="handleBreadcrumbDragLeave(event)" ondrop="handleBreadcrumbDrop(event, \'' + escapePath(rootPath) + '\')">' +
            '<i>' + (isWindows ? '💻' : '📁') + '</i> ' + escapeHtml(rootLabel) + '</span>';

    let accum = isWindows ? rootPath : '';
    for (let i = 0; i < parts.length; i++) {
        if (isWindows && i === 0 && parts[0].endsWith(':')) continue;
        accum = isWindows ? (accum.endsWith('\\') ? accum + parts[i] : accum + '\\' + parts[i]) : accum + '/' + parts[i];
        const isCurrent = (i === parts.length - 1);
        html += '<span class="crumb-sep">›</span>';
        html += '<span class="crumb' + (isCurrent ? ' current' : '') + '" onclick="event.stopPropagation(); navigateTo(\'' + escapePath(accum) + '\')" ondragover="handleBreadcrumbDragOver(event, \'' + escapePath(accum) + '\')" ondragleave="handleBreadcrumbDragLeave(event)" ondrop="handleBreadcrumbDrop(event, \'' + escapePath(accum) + '\')">' +
                escapeHtml(parts[i]) + '</span>';
    }
    container.innerHTML = html;
    updateCompactWindowTitle();
}

function handlePathBarClick(e) {
    if (e.target.id === 'btn-path-dropdown' || e.target.closest('#btn-path-dropdown')) return;
    if (e.target.id === 'btn-pin-address-bar' || e.target.closest('#btn-pin-address-bar')) return;
    if (e.target.classList.contains('crumb')) return;
    enterPathEditMode();
}

function handleAddressBarPinClick(e) {
    if (e) {
        if (e.stopPropagation) e.stopPropagation();
        if (e.preventDefault) e.preventDefault();
    }
    togglePinCurrentFolder();
}

function enterPathEditMode() {
    const breadcrumbs = document.getElementById('path-breadcrumbs');
    const input = document.getElementById('path');
    if (breadcrumbs && input) {
        breadcrumbs.style.display = 'none';
        input.style.display = 'block';
        input.value = currentPath;
        input.focus();
        input.select();
    }
}

function exitPathEditMode() {
    const breadcrumbs = document.getElementById('path-breadcrumbs');
    const input = document.getElementById('path');
    const pathBarBox = document.getElementById('path-bar-box');
    const compactTitle = document.getElementById('compact-window-title');
    if (breadcrumbs && input) {
        input.style.display = 'none';
        breadcrumbs.style.display = 'flex';
    }
    if (typeof isCompactBars !== 'undefined' && isCompactBars) {
        if (pathBarBox) pathBarBox.style.display = 'none';
        if (compactTitle) {
            updateCompactWindowTitle();
            compactTitle.style.display = 'flex';
        }
    }
}

function handlePathEnter(e) {
    if (e.key === 'Enter') {
        const target = document.getElementById('path').value.trim();
        exitPathEditMode();
        if (target) navigateTo(target);
    }
}


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
// 🤖 AGENT MACHINE-LEVEL SEARCH ENGINE
// ══════════════════════════════════════════════════════════
let searchScope = 'folder'; // 'folder' | 'machine'
let isAgentSearchResultsActive = false;
let originalFolderItems = [];
let agentSearchTimer = null;

function toggleSearchScope() {
    searchScope = searchScope === 'folder' ? 'machine' : 'folder';
    updateSearchScopeUI();
}

function updateSearchScopeUI() {
    const pill = document.getElementById('search-scope-pill');
    const icon = document.getElementById('scope-icon');
    const label = document.getElementById('scope-label');
    const input = document.getElementById('search');
    const btnAction = document.getElementById('btn-agent-search-action');
    const actionIcon = btnAction ? btnAction.querySelector('i') : null;

    if (searchScope === 'machine') {
        pill.classList.add('machine-mode');
        icon.textContent = '⚡';
        label.textContent = 'Machine';
        input.placeholder = 'Search entire machine (e.g. *.cs)...';
        input.classList.add('machine-focus');
        if (btnAction) {
            btnAction.title = 'Search Entire Machine (Enter)';
            btnAction.classList.add('active-machine-action');
        }
        if (actionIcon) actionIcon.textContent = '⚡';
        showToast('Agent Search: Machine Index active', '⚡');
    } else {
        pill.classList.remove('machine-mode');
        icon.textContent = '📁';
        label.textContent = 'Folder';
        input.placeholder = 'Filter current folder...';
        input.classList.remove('machine-focus');
        if (btnAction) {
            btnAction.title = 'Filter current folder';
            btnAction.classList.remove('active-machine-action');
        }
        if (actionIcon) actionIcon.textContent = '🔍';
        if (isAgentSearchResultsActive) exitAgentSearch();
    }
    input.focus();
}

function handleSearchActionClick() {
    if (searchScope === 'machine') {
        triggerAgentSearch();
    } else {
        handleSearch();
    }
}

function handleSearchInput(e) {
    const val = document.getElementById('search').value;
    const clearBtn = document.getElementById('search-clear-btn');
    if (clearBtn) clearBtn.style.display = val ? 'block' : 'none';

    if (searchScope === 'folder') {
        handleSearch();
    }
}

function handleSearchKey(e) {
    if (e.key === 'Enter') {
        if (searchScope === 'machine') {
            triggerAgentSearch();
        }
    } else if (e.key === 'Escape') {
        clearSearch();
    }
}

function clearSearch() {
    const input = document.getElementById('search');
    input.value = '';
    const clearBtn = document.getElementById('search-clear-btn');
    if (clearBtn) clearBtn.style.display = 'none';

    if (isAgentSearchResultsActive) {
        exitAgentSearch();
    } else {
        handleSearch();
    }
}

async function triggerAgentSearch() {
    const query = document.getElementById('search').value.trim();
    if (!query) {
        showToast('Please type a search query', '⚠️');
        return;
    }

    const banner = document.getElementById('search-results-banner');
    const bannerText = document.getElementById('search-banner-text');
    const bannerMeta = document.getElementById('search-banner-meta');

    if (banner) {
        banner.style.display = 'flex';
        bannerText.innerHTML = '🤖 Agent searching machine for "<strong>' + escapeHtml(query) + '</strong>"...';
        bannerMeta.innerText = 'Scanning index...';
    }

    if (!isAgentSearchResultsActive) {
        originalFolderItems = [...currentItems];
        isAgentSearchResultsActive = true;
    }

    try {
        const res = await fetch('/api/files/agentSearch?query=' + encodeURIComponent(query) + '&scope=machine&currentPath=' + encodeURIComponent(currentPath));
        if (!res.ok) {
            showToast('Agent search failed', '❌');
            return;
        }
        const data = await res.json();

        bannerText.innerHTML = '⚡ <strong>' + data.count + '</strong> match' + (data.count === 1 ? '' : 'es') + ' found across machine for "<strong>' + escapeHtml(query) + '</strong>"';
        bannerMeta.innerText = (data.engine || 'Spotlight Index') + ' • ' + (data.executionTimeMs || 0) + 'ms';

        currentItems = (data.items || []).map(function(item) {
            return {
                name: item.name,
                path: item.path,
                directory: item.directory,
                type: item.type,
                size: item.size,
                modified: item.modified,
                isSearchResult: true
            };
        });

        applySortAndRender();
        showToast('Agent Search complete: ' + data.count + ' items found in ' + data.executionTimeMs + 'ms', '⚡');
    } catch (err) {
        console.error(err);
        showToast('Agent Search error', '❌');
    }
}

function exitAgentSearch() {
    isAgentSearchResultsActive = false;
    const banner = document.getElementById('search-results-banner');
    if (banner) banner.style.display = 'none';

    const input = document.getElementById('search');
    input.value = '';
    const clearBtn = document.getElementById('search-clear-btn');
    if (clearBtn) clearBtn.style.display = 'none';

    currentItems = [...originalFolderItems];
    applySortAndRender();
    showToast('Returned to folder', '📁');
}

function formatLocationDisplay(dirPath) {
    if (!dirPath) return '';
    const sep = isWindows ? '\\' : '/';
    const parts = dirPath.split(sep).filter(Boolean);
    if (parts.length > 2) {
        return '…' + sep + parts[parts.length - 2] + sep + parts[parts.length - 1];
    } else if (parts.length > 0) {
        return parts.join(sep);
    }
    return dirPath;
}

function jumpToSearchResult(directory, fileName) {
    exitAgentSearch();
    loadFiles(directory).then(function() {
        setTimeout(function() {
            const itemEls = document.querySelectorAll('.item');
            itemEls.forEach(function(el) {
                const nameEl = el.querySelector('.item-name');
                if (nameEl && nameEl.innerText === fileName) {
                    el.classList.add('selected');
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            });
        }, 300);
    });
}

// ══════════════════════════════════════════════════════════
// 🎨 VISUAL FILE TYPES & BADGES
// ══════════════════════════════════════════════════════════
function getFileVisual(name, isDir) {
    if (isDir) {
        return { icon: '📁', badge: '', color: '#ffbe76', isImage: false, isDir: true, typeLabel: 'File folder' };
    }
    const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
    switch(ext) {
        case 'cs': return { icon: '🔷', badge: 'C#', color: '#68217a', isImage: false, typeLabel: 'C# Source File' };
        case 'ts': return { icon: '🟦', badge: 'TS', color: '#3178c6', isImage: false, typeLabel: 'TypeScript File' };
        case 'js': return { icon: '🟨', badge: 'JS', color: '#f7df1e', isImage: false, typeLabel: 'JavaScript File' };
        case 'py': return { icon: '🐍', badge: 'PY', color: '#3776ab', isImage: false, typeLabel: 'Python Script' };
        case 'json': return { icon: '🟧', badge: '{}', color: '#e67e22', isImage: false, typeLabel: 'JSON File' };
        case 'html': return { icon: '🌐', badge: '<>', color: '#e44d26', isImage: false, typeLabel: 'HTML Document' };
        case 'css': return { icon: '🎨', badge: '#', color: '#264de4', isImage: false, typeLabel: 'CSS Stylesheet' };
        case 'md': return { icon: '📝', badge: 'MD', color: '#4a90e2', isImage: false, typeLabel: 'Markdown Document' };
        case 'sql': return { icon: '🗄️', badge: 'SQL', color: '#00cec9', isImage: false, typeLabel: 'SQL Query File' };
        case 'sh': case 'bash': case 'zsh': return { icon: '⚡', badge: 'SH', color: '#2ecc71', isImage: false, typeLabel: 'Shell Script' };
        case 'xml': case 'yaml': case 'yml': return { icon: '⚙️', badge: 'CFG', color: '#9b59b6', isImage: false, typeLabel: 'Configuration File' };
        case 'png': case 'jpg': case 'jpeg': case 'gif': case 'webp': case 'svg': case 'ico':
            return { icon: '🖼️', badge: ext.toUpperCase(), color: '#e056fd', isImage: true, typeLabel: ext.toUpperCase() + ' Image' };
        case 'mp4': case 'mov': case 'mkv': case 'webm':
            return { icon: '🎬', badge: 'VID', color: '#eb4d4b', isImage: false, typeLabel: 'Video File' };
        case 'mp3': case 'wav': case 'flac': case 'm4a':
            return { icon: '🎵', badge: 'AUD', color: '#00cec9', isImage: false, typeLabel: 'Audio File' };
        case 'zip': case 'tar': case 'gz': case 'rar': case '7z':
            return { icon: '📦', badge: 'ZIP', color: '#f0932b', isImage: false, typeLabel: 'Compressed Archive' };
        case 'pdf': return { icon: '📕', badge: 'PDF', color: '#e74c3c', isImage: false, typeLabel: 'PDF Document' };
        case 'txt': case 'log': return { icon: '📄', badge: 'TXT', color: '#95a5a6', isImage: false, typeLabel: 'Text Document' };
        case 'doc': case 'docx': return { icon: '📘', badge: 'DOC', color: '#2980b9', isImage: false, typeLabel: 'Word Document' };
        case 'xls': case 'xlsx': case 'csv': return { icon: '📊', badge: 'XLS', color: '#27ae60', isImage: false, typeLabel: 'Spreadsheet' };
        default: return { icon: '📄', badge: ext ? ext.slice(0, 3).toUpperCase() : '', color: '#888899', isImage: false, typeLabel: (ext ? ext.toUpperCase() + ' File' : 'File') };
    }
}

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
// 🖼️ RENDER ITEMS & VIEWS
// ══════════════════════════════════════════════════════════
let currentViewMode = safeStorage.getItem('venel_view_mode') || 'grid';

function toggleViewMenu(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    const menu = document.getElementById('view-dropdown-menu');
    if (menu) {
        const isHidden = menu.style.display === 'none' || !menu.style.display;
        menu.style.display = isHidden ? 'flex' : 'none';
    }
}

function closeViewMenu() {
    const menu = document.getElementById('view-dropdown-menu');
    if (menu) menu.style.display = 'none';
}

function setView(mode) {
    currentViewMode = mode;
    safeStorage.setItem('venel_view_mode', mode);
    closeViewMenu();

    const filesContainer = document.getElementById('files');
    const listHeader = document.getElementById('list-header');
    const iconEl = document.getElementById('current-view-icon');
    const labelEl = document.getElementById('current-view-label');

    if (!filesContainer) return;

    // Reset view class names
    filesContainer.classList.remove('details-view', 'list-view', 'grid-view', 'grid-small-view', 'large-view', 'compact-view');

    // Update menu checkmarks
    document.querySelectorAll('.view-menu-item').forEach(function(el) {
        el.classList.remove('active');
    });
    const activeItem = document.getElementById('opt-' + mode);
    if (activeItem) activeItem.classList.add('active');

    // View configurations
    const viewConfigs = {
        'details': { cls: 'details-view', showHeader: true, icon: '📑', label: 'Details' },
        'list': { cls: 'list-view', showHeader: false, icon: '☰', label: 'List' },
        'grid': { cls: 'grid-view', showHeader: false, icon: '⊞', label: 'Grid' },
        'grid-small': { cls: 'grid-small-view', showHeader: false, icon: '▦', label: 'Small Grid' },
        'large': { cls: 'large-view', showHeader: false, icon: '🖼️', label: 'Large' },
        'compact': { cls: 'compact-view', showHeader: false, icon: '🗂️', label: 'Compact' }
    };

    const cfg = viewConfigs[mode] || viewConfigs['grid'];
    filesContainer.classList.add(cfg.cls);
    if (listHeader) listHeader.style.display = cfg.showHeader ? 'grid' : 'none';
    if (iconEl) iconEl.textContent = cfg.icon;
    if (labelEl) labelEl.textContent = cfg.label;

    updateViewMenuChecks();
    showToast('View: ' + cfg.label, cfg.icon);
}

function togglePreview(forcedState) {
    const pane = document.getElementById('preview-pane');
    const resizer = document.getElementById('preview-resizer');
    const btn = document.getElementById('btn-preview');
    if (pane) {
        let isNowCollapsed;
        if (typeof forcedState === 'boolean') {
            isNowCollapsed = forcedState;
            pane.classList.toggle('collapsed', isNowCollapsed);
        } else {
            isNowCollapsed = pane.classList.toggle('collapsed');
        }
        safeStorage.setItem('venel_preview_collapsed', isNowCollapsed ? 'true' : 'false');
        if (btn) btn.classList.toggle('active', !isNowCollapsed);
        if (resizer) resizer.style.display = isNowCollapsed ? 'none' : 'block';
        if (!isNowCollapsed) {
            if (selectedItem) handlePreview(selectedItem.name, selectedItem.type === 'Directory');
        }
    }
    updateDockStripVisibility();
    updateViewMenuChecks();
}

function updateDockStripVisibility() {
    const sidebar = document.getElementById('quick-access-sidebar');
    const preview = document.getElementById('preview-pane');
    const leftStrip = document.getElementById('dock-margin-strip');
    const rightStrip = document.getElementById('dock-margin-strip-right');
    const dockFav = document.getElementById('dock-tab-favorites');
    const dockPrev = document.getElementById('dock-tab-preview');

    const sidebarCollapsed = sidebar ? sidebar.classList.contains('collapsed') : false;
    const previewCollapsed = preview ? preview.classList.contains('collapsed') : false;

    if (dockFav) dockFav.style.display = sidebarCollapsed ? 'flex' : 'none';
    if (dockPrev) dockPrev.style.display = previewCollapsed ? 'flex' : 'none';

    if (leftStrip) {
        leftStrip.style.display = sidebarCollapsed ? 'flex' : 'none';
    }
    if (rightStrip) {
        rightStrip.style.display = previewCollapsed ? 'flex' : 'none';
    }
}

// ══════════════════════════════════════════════════════════
// 🗜️ COMPACT MODE & FOLDER TITLE DISPLAY (VISUAL STUDIO ZEN)
// ══════════════════════════════════════════════════════════
let isCompactBars = safeStorage.getItem('venel_compact_bars') === 'true';

function toggleCompactBars(forcedState) {
    if (typeof forcedState === 'boolean') {
        isCompactBars = forcedState;
    } else {
        isCompactBars = !isCompactBars;
    }
    safeStorage.setItem('venel_compact_bars', isCompactBars ? 'true' : 'false');
    applyCompactBarsState();
    showToast(isCompactBars ? 'Compact Header Mode (Bars Collapsed)' : 'Full Power Chrome (Bars Expanded)', isCompactBars ? '🗜️' : '⊞');
}

function applyCompactBarsState() {
    const bookmarksBar = document.getElementById('bookmarks-bar');
    const mainToolbar = document.getElementById('main-toolbar');
    const quickFilterBar = document.getElementById('quick-filter-bar');
    const btnCompact = document.getElementById('btn-toggle-compact');
    const compactTitle = document.getElementById('compact-window-title');
    const pathBarBox = document.getElementById('path-bar-box');
    const chkCompact = document.getElementById('menu-chk-compact-bars');

    if (isCompactBars) {
        document.body.classList.add('compact-header');
        if (bookmarksBar) bookmarksBar.style.display = 'none';
        if (mainToolbar) mainToolbar.style.display = 'none';
        if (quickFilterBar) quickFilterBar.style.display = 'none';
        if (btnCompact) {
            btnCompact.textContent = '⌄';
            btnCompact.title = 'Expand Menus & Toolbars (Ctrl+F1 / ⌘⌥T)';
            btnCompact.classList.add('active');
        }
        if (compactTitle) {
            updateCompactWindowTitle();
            compactTitle.style.display = 'flex';
        }
        if (pathBarBox) pathBarBox.style.display = 'none';
        if (chkCompact) chkCompact.textContent = '✓';
    } else {
        document.body.classList.remove('compact-header');
        if (bookmarksBar) bookmarksBar.style.display = 'flex';
        if (mainToolbar) mainToolbar.style.display = 'flex';
        if (quickFilterBar) quickFilterBar.style.display = 'flex';
        if (btnCompact) {
            btnCompact.textContent = '⌃';
            btnCompact.title = 'Collapse Menus & Toolbars (Ctrl+F1 / ⌘⌥T)';
            btnCompact.classList.remove('active');
        }
        if (compactTitle) compactTitle.style.display = 'none';
        if (pathBarBox) pathBarBox.style.display = 'flex';
        if (chkCompact) chkCompact.textContent = '';
    }
    updateViewMenuChecks();
}

function updateCompactWindowTitle() {
    const titleEl = document.getElementById('compact-title-text');
    if (!titleEl) return;
    const sep = isWindows ? '\\' : '/';
    if (!currentPath || currentPath === '.') {
        titleEl.textContent = 'VenEl File Manager';
        return;
    }
    const parts = currentPath.split(sep).filter(Boolean);
    const folderName = parts.length > 0 ? parts[parts.length - 1] : currentPath;
    titleEl.textContent = folderName + ' — VenEl File Manager';
    const box = document.getElementById('compact-window-title');
    if (box) {
        box.title = currentPath + ' (Click to edit path • Double-click to expand toolbars)';
    }
}

function expandPathFromCompactTitle(e) {
    if (e && e.detail === 2) {
        toggleCompactBars(false);
        return;
    }
    const pathBarBox = document.getElementById('path-bar-box');
    const compactTitle = document.getElementById('compact-window-title');
    if (compactTitle) compactTitle.style.display = 'none';
    if (pathBarBox) {
        pathBarBox.style.display = 'flex';
        enterPathEditMode();
    }
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

    let iconHtml = '<i>' + visual.icon + '</i>';
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
        isWindows = typeof currentPath === 'string' && currentPath.includes('\\');
        document.getElementById('path').value = currentPath;
        renderBreadcrumbs();
        updateActiveTabAfterLoad(currentPath);

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
        if (nextPath.startsWith('sftp://')) {
            activePreviewPath = nextPath;
            activePreviewIsDir = false;
            loadInlineEditor();
        } else {
            smartOpenFile(nextPath);
        }
    }
}

// ══════════════════════════════════════════════════════════
// ⌨️ TYPE-TO-SELECT / INCREMENTAL SEARCH & KEYBOARD NAV
// ══════════════════════════════════════════════════════════
function getVisibleItems() {
    return (displayedItems && displayedItems.length > 0) ? displayedItems : (currentItems || []);
}

function findItemElementByName(name) {
    ensureItemRendered(name);
    const items = document.querySelectorAll('#files .item');
    for (let i = 0; i < items.length; i++) {
        if (items[i].getAttribute('data-name') === name) {
            return items[i];
        }
    }
    return null;
}

function selectAndScrollToItem(item) {
    if (!item) return;
    selectedItems = [item];
    selectedItem = item;
    lastSelectedName = item.name;
    syncItemSelectionDOM();
    updateSelectionState();
    handlePreview(item.name, item.type === 'Directory');

    const el = findItemElementByName(item.name);
    if (el) {
        el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }
}

function showTypeAheadBadge(query, currentMatchIdx, totalMatches) {
    const badge = document.getElementById('type-ahead-badge');
    const queryEl = document.getElementById('type-ahead-query');
    const countEl = document.getElementById('type-ahead-count');
    if (!badge || !queryEl || !countEl) return;

    queryEl.textContent = query;
    if (totalMatches > 0) {
        badge.classList.remove('no-match');
        countEl.textContent = '(' + (currentMatchIdx + 1) + '/' + totalMatches + ')';
    } else {
        badge.classList.add('no-match');
        countEl.textContent = '(no matches)';
    }
    badge.classList.add('visible');
}

function hideTypeAheadBadge() {
    const badge = document.getElementById('type-ahead-badge');
    if (badge) {
        badge.classList.remove('visible');
    }
}

function clearTypeAhead() {
    typeAheadBuffer = '';
    if (typeAheadTimer) {
        clearTimeout(typeAheadTimer);
        typeAheadTimer = null;
    }
    hideTypeAheadBadge();
}

function handleTypeAhead(char) {
    const items = getVisibleItems();
    if (!items || items.length === 0) return;

    const lowerChar = char.toLowerCase();
    const isSingleCharCycle = (typeAheadBuffer.length === 1 && typeAheadBuffer.toLowerCase() === lowerChar);

    if (isSingleCharCycle) {
        // Repeating the same single character cycles through all matches starting with that letter
        const matches = items.filter(function(i) {
            return i.name && i.name.toLowerCase().startsWith(lowerChar);
        });

        if (matches.length > 0) {
            let currentIdx = -1;
            if (selectedItem) {
                currentIdx = matches.findIndex(function(m) { return m.name === selectedItem.name; });
            }
            const nextIdx = (currentIdx + 1) % matches.length;
            selectAndScrollToItem(matches[nextIdx]);
            showTypeAheadBadge(typeAheadBuffer, nextIdx, matches.length);
        } else {
            showTypeAheadBadge(typeAheadBuffer, 0, 0);
        }
    } else {
        // Appending character to incremental search buffer
        typeAheadBuffer += char;
        const q = typeAheadBuffer.toLowerCase();

        // 1. Prefix matches first (standard OS Explorer / Finder behavior)
        let matches = items.filter(function(i) {
            return i.name && i.name.toLowerCase().startsWith(q);
        });

        // 2. Fallback to contains matches if no prefix matches
        if (matches.length === 0) {
            matches = items.filter(function(i) {
                return i.name && i.name.toLowerCase().includes(q);
            });
        }

        if (matches.length > 0) {
            selectAndScrollToItem(matches[0]);
            showTypeAheadBadge(typeAheadBuffer, 0, matches.length);
        } else {
            showTypeAheadBadge(typeAheadBuffer, 0, 0);
        }
    }

    if (typeAheadTimer) clearTimeout(typeAheadTimer);
    typeAheadTimer = setTimeout(function() {
        clearTypeAhead();
    }, 1100);
}

function handleTypeAheadBackspace() {
    if (!typeAheadBuffer || typeAheadBuffer.length === 0) return false;
    typeAheadBuffer = typeAheadBuffer.slice(0, -1);
    if (typeAheadBuffer.length === 0) {
        clearTypeAhead();
        return true;
    }

    const items = getVisibleItems();
    const q = typeAheadBuffer.toLowerCase();
    let matches = items.filter(function(i) {
        return i.name && i.name.toLowerCase().startsWith(q);
    });
    if (matches.length === 0) {
        matches = items.filter(function(i) {
            return i.name && i.name.toLowerCase().includes(q);
        });
    }

    if (matches.length > 0) {
        selectAndScrollToItem(matches[0]);
        showTypeAheadBadge(typeAheadBuffer, 0, matches.length);
    } else {
        showTypeAheadBadge(typeAheadBuffer, 0, 0);
    }

    if (typeAheadTimer) clearTimeout(typeAheadTimer);
    typeAheadTimer = setTimeout(function() {
        clearTypeAhead();
    }, 1100);
    return true;
}

function navigateSelection(delta, isShift) {
    const items = getVisibleItems();
    if (!items || items.length === 0) return;

    clearTypeAhead();

    let curIdx = -1;
    if (selectedItem) {
        curIdx = items.findIndex(function(i) { return i.name === selectedItem.name; });
    }

    let nextIdx;
    if (delta === 'first') {
        nextIdx = 0;
    } else if (delta === 'last') {
        nextIdx = items.length - 1;
    } else {
        if (curIdx === -1) {
            nextIdx = delta > 0 ? 0 : items.length - 1;
        } else {
            nextIdx = curIdx + delta;
            if (nextIdx < 0) nextIdx = 0;
            if (nextIdx >= items.length) nextIdx = items.length - 1;
        }
    }

    const target = items[nextIdx];
    if (!target) return;

    if (isShift && lastSelectedName) {
        const fromIdx = items.findIndex(function(i) { return i.name === lastSelectedName; });
        if (fromIdx !== -1) {
            const start = Math.min(fromIdx, nextIdx);
            const end = Math.max(fromIdx, nextIdx);
            selectedItems = items.slice(start, end + 1);
            selectedItem = target;
            syncItemSelectionDOM();
            updateSelectionState();
            if (selectedItems.length === 1) {
                handlePreview(selectedItem.name, selectedItem.type === 'Directory');
            } else {
                renderMultiSelectionPreview();
            }
            const el = findItemElementByName(target.name);
            if (el) el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
            return;
        }
    }

    selectAndScrollToItem(target);
}

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
    const rawUrl = sftpInfo
        ? `/api/sftp/download?connectionId=${encodeURIComponent(sftpInfo.connectionId)}&path=${encodeURIComponent(sftpInfo.remotePath)}`
        : ('/api/files/raw?path=' + encodeURIComponent(fullPath));
    const readUrl = sftpInfo
        ? `/api/sftp/read?connectionId=${encodeURIComponent(sftpInfo.connectionId)}&path=${encodeURIComponent(sftpInfo.remotePath)}`
        : ('/api/files/read?path=' + encodeURIComponent(fullPath));

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
        document.getElementById('prop-icon').innerText = visual.icon;
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

                favHtml += '<div class="fav-pinned-item ' + (isActive ? 'active' : '') + '" onclick="navigateToBookmark(\'' + escapePath(b.path) + '\', ' + isDir + ')" title="' + escapeHtml(b.path) + '">' +
                    '<div class="fav-item-main">' +
                        '<i class="fav-item-icon">' + icon + '</i>' +
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
    ['working-dir', 'favorites', 'places', 'sftp'].forEach(function(sec) {
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
    } catch {}

    // 2. Fetch server environment API
    try {
        const res = await fetch('/api/env/info').catch(() => null);
        if (res && res.ok) {
            const data = await res.json();
            if (data && data.ideName) {
                updateIdeEnvironmentInfo(data.ideName, data.workspaceFolders, data.primaryWorkspace);
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
// 🌐 SFTP REMOTE MANAGER (Sessions, Quick Connect, Saved Profiles)
// ══════════════════════════════════════════════════════════

let sftpActiveSessions = [];
let sftpSavedProfiles = [];
let sftpCurrentAuthMode = 'password';

function parseSftpUrl(url) {
    if (!url || typeof url !== 'string' || !url.startsWith('sftp://')) return null;
    const withoutPrefix = url.substring(7);
    const slashIdx = withoutPrefix.indexOf('/');
    if (slashIdx === -1) {
        return { connectionId: withoutPrefix, remotePath: '/' };
    }
    return {
        connectionId: withoutPrefix.substring(0, slashIdx),
        remotePath: withoutPrefix.substring(slashIdx) || '/'
    };
}

function loadSftpSavedProfiles() {
    try {
        const raw = safeStorage.getItem('venel_sftp_profiles');
        sftpSavedProfiles = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(sftpSavedProfiles)) sftpSavedProfiles = [];
    } catch {
        sftpSavedProfiles = [];
    }
}

function saveSftpProfilesToStorage() {
    try {
        safeStorage.setItem('venel_sftp_profiles', JSON.stringify(sftpSavedProfiles));
    } catch {}
}

async function refreshSftpSessionsList() {
    loadSftpSavedProfiles();
    try {
        const res = await fetch('/api/sftp/sessions').catch(() => null);
        if (res && res.ok) {
            sftpActiveSessions = await res.json();
            if (!Array.isArray(sftpActiveSessions)) sftpActiveSessions = [];
        } else {
            sftpActiveSessions = [];
        }
    } catch {
        sftpActiveSessions = [];
    }

    renderSftpSidebar();
}

function renderSftpSidebar() {
    const listEl = document.getElementById('sftp-connections-list');
    const badgeEl = document.getElementById('sftp-active-count-badge');
    if (!listEl) return;

    if (badgeEl) {
        const count = sftpActiveSessions.length;
        badgeEl.textContent = count;
        badgeEl.style.display = count > 0 ? 'inline-block' : 'none';
    }

    let html = '';

    // 1. Active Connected Sessions
    if (sftpActiveSessions.length > 0) {
        sftpActiveSessions.forEach(session => {
            const isCurrent = currentPath.startsWith('sftp://' + session.connectionId);
            const targetUrl = `sftp://${session.connectionId}${session.initialPath || '/'}`;
            html += `<div class="sftp-conn-item active ${isCurrent ? 'selected' : ''}" onclick="navigateTo('${escapePath(targetUrl)}')">` +
                '<div class="sftp-conn-info">' +
                    '<div class="sftp-conn-title-row">' +
                        '<span class="sftp-conn-dot" title="Active SSH Session"></span>' +
                        `<span class="sftp-conn-name" title="${escapeHtml(session.name)}">${escapeHtml(session.name)}</span>` +
                    '</div>' +
                    `<div class="sftp-conn-sub">${escapeHtml(session.username)}@${escapeHtml(session.host)}:${session.port}</div>` +
                '</div>' +
                '<div class="sftp-conn-actions">' +
                    `<button class="sftp-icon-btn danger" onclick="disconnectSftpSession('${session.connectionId}', event)" title="Disconnect SSH Tunnel">⏏️</button>` +
                '</div>' +
            '</div>';
        });
    }

    // 2. Saved Connection Profiles (not currently connected)
    const activeHosts = new Set(sftpActiveSessions.map(s => `${s.username}@${s.host}:${s.port}`));
    const inactiveProfiles = sftpSavedProfiles.filter(p => !activeHosts.has(`${p.username}@${p.host}:${p.port || 22}`));

    if (inactiveProfiles.length > 0) {
        inactiveProfiles.forEach(prof => {
            html += `<div class="sftp-conn-item" onclick="connectSavedProfile('${prof.id}')" title="Click to Connect">` +
                '<div class="sftp-conn-info">' +
                    '<div class="sftp-conn-title-row">' +
                        '<span style="font-size: 13px;">⚡</span>' +
                        `<span class="sftp-conn-name" title="${escapeHtml(prof.name || prof.host)}">${escapeHtml(prof.name || prof.host)}</span>` +
                    '</div>' +
                    `<div class="sftp-conn-sub">${escapeHtml(prof.username)}@${escapeHtml(prof.host)}:${prof.port || 22}</div>` +
                '</div>' +
                '<div class="sftp-conn-actions">' +
                    `<button class="sftp-icon-btn" onclick="openSftpModal(getSavedProfileById('${prof.id}'), event)" title="Edit Profile">✏️</button>` +
                    `<button class="sftp-icon-btn danger" onclick="deleteSavedSftpProfile('${prof.id}', event)" title="Delete Profile">✕</button>` +
                '</div>' +
            '</div>';
        });
    }

    if (sftpActiveSessions.length === 0 && sftpSavedProfiles.length === 0) {
        html = '<div style="padding: 10px 8px; font-size: 11px; color: var(--text-muted); text-align: center; line-height: 1.4;">' +
            'No remote connections.<br><button class="sftp-browse-btn" onclick="openSftpModal()" style="margin-top: 6px;">+ Connect to SFTP</button>' +
        '</div>';
    }

    listEl.innerHTML = html;
}

function getSavedProfileById(id) {
    return sftpSavedProfiles.find(p => p.id === id);
}

function openSftpModal(profileToEdit = null, event = null) {
    if (profileToEdit && (profileToEdit instanceof Event || profileToEdit.target)) {
        event = profileToEdit;
        profileToEdit = null;
    }
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    const modal = document.getElementById('modal-sftp');
    if (!modal) return;

    const alertEl = document.getElementById('sftp-status-alert');
    if (alertEl) alertEl.style.display = 'none';

    // Populate or reset form fields
    const nameInput = document.getElementById('sftp-input-name');
    const hostInput = document.getElementById('sftp-input-host');
    const portInput = document.getElementById('sftp-input-port');
    const userInput = document.getElementById('sftp-input-user');
    const pwdInput = document.getElementById('sftp-input-password');
    const keyInput = document.getElementById('sftp-input-key');
    const passInput = document.getElementById('sftp-input-passphrase');
    const pathInput = document.getElementById('sftp-input-path');
    const saveChk = document.getElementById('sftp-chk-save-profile');
    const rememberChk = document.getElementById('sftp-chk-remember-creds');
    const titleEl = document.getElementById('sftp-modal-title');

    if (profileToEdit) {
        if (titleEl) titleEl.textContent = 'Edit SFTP Connection';
        modal.setAttribute('data-edit-id', profileToEdit.id);
        if (nameInput) nameInput.value = profileToEdit.name || '';
        if (hostInput) hostInput.value = profileToEdit.host || '';
        if (portInput) portInput.value = profileToEdit.port || 22;
        if (userInput) userInput.value = profileToEdit.username || '';
        if (pathInput) pathInput.value = profileToEdit.initialPath || '';
        if (pwdInput) pwdInput.value = profileToEdit.password || '';
        if (keyInput) keyInput.value = profileToEdit.privateKeyContent || '';
        if (passInput) passInput.value = profileToEdit.privateKeyPassphrase || '';
        switchSftpAuthMode(profileToEdit.authType || 'password');
        if (saveChk) saveChk.checked = true;
        if (rememberChk) rememberChk.checked = Boolean(profileToEdit.password || profileToEdit.privateKeyContent);
    } else {
        if (titleEl) titleEl.textContent = 'Connect to SFTP Server';
        modal.removeAttribute('data-edit-id');
        if (nameInput) nameInput.value = '';
        if (hostInput) hostInput.value = '';
        if (portInput) portInput.value = 22;
        if (userInput) userInput.value = '';
        if (pathInput) pathInput.value = '/';
        if (pwdInput) pwdInput.value = '';
        if (keyInput) keyInput.value = '';
        if (passInput) passInput.value = '';
        switchSftpAuthMode('password');
        if (saveChk) saveChk.checked = true;
        if (rememberChk) rememberChk.checked = true;
    }

    modal.style.display = 'flex';
    setTimeout(() => {
        if (hostInput && !hostInput.value) hostInput.focus();
    }, 50);
}

function closeSftpModal(e = null) {
    if (e && e.target && e.target.id !== 'modal-sftp' && !e.target.classList.contains('modal-close-x') && !e.target.closest('.modal-close-x') && !e.target.classList.contains('cancel') && !e.target.closest('.cancel')) {
        return;
    }
    const modal = document.getElementById('modal-sftp');
    if (modal) modal.style.display = 'none';
}

function switchSftpAuthMode(mode) {
    sftpCurrentAuthMode = mode;
    const tabPwd = document.getElementById('btn-auth-tab-password');
    const tabKey = document.getElementById('btn-auth-tab-key');
    const panelPwd = document.getElementById('sftp-auth-panel-password');
    const panelKey = document.getElementById('sftp-auth-panel-key');

    if (tabPwd) tabPwd.classList.toggle('active', mode === 'password');
    if (tabKey) tabKey.classList.toggle('active', mode === 'key');

    if (panelPwd) panelPwd.style.display = mode === 'password' ? 'block' : 'none';
    if (panelKey) panelKey.style.display = mode === 'key' ? 'block' : 'none';
}

function toggleSftpPasswordVisibility() {
    const pwd = document.getElementById('sftp-input-password');
    const btn = document.getElementById('btn-toggle-sftp-pwd');
    if (!pwd) return;
    if (pwd.type === 'password') {
        pwd.type = 'text';
        if (btn) btn.textContent = '🔒';
    } else {
        pwd.type = 'password';
        if (btn) btn.textContent = '👁️';
    }
}

function handleSftpKeyFileSelected(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(evt) {
        const text = evt.target.result;
        const keyInput = document.getElementById('sftp-input-key');
        if (keyInput) keyInput.value = text;
        showToast('Loaded private key: ' + file.name, '🔑');
    };
    reader.readAsText(file);
}

function handleSftpSaveCheckboxChange() {
    const saveChk = document.getElementById('sftp-chk-save-profile');
    const remLabel = document.getElementById('sftp-lbl-remember-creds');
    if (remLabel && saveChk) {
        remLabel.style.display = saveChk.checked ? 'flex' : 'none';
    }
}

function getSftpFormData() {
    const name = (document.getElementById('sftp-input-name')?.value || '').trim();
    const host = (document.getElementById('sftp-input-host')?.value || '').trim();
    const port = parseInt(document.getElementById('sftp-input-port')?.value || '22', 10);
    const username = (document.getElementById('sftp-input-user')?.value || '').trim();
    const password = document.getElementById('sftp-input-password')?.value || '';
    const privateKeyContent = (document.getElementById('sftp-input-key')?.value || '').trim();
    const privateKeyPassphrase = document.getElementById('sftp-input-passphrase')?.value || '';
    const initialPath = (document.getElementById('sftp-input-path')?.value || '').trim();

    return {
        connectionName: name,
        host,
        port: isNaN(port) || port <= 0 ? 22 : port,
        username,
        authType: sftpCurrentAuthMode,
        password: sftpCurrentAuthMode === 'password' ? password : null,
        privateKeyContent: sftpCurrentAuthMode === 'key' ? privateKeyContent : null,
        privateKeyPassphrase: sftpCurrentAuthMode === 'key' ? privateKeyPassphrase : null,
        initialPath: initialPath || '/'
    };
}

function showSftpAlert(message, type = 'info') {
    const alertEl = document.getElementById('sftp-status-alert');
    if (!alertEl) return;
    alertEl.className = 'sftp-alert-' + type;
    alertEl.textContent = message;
    alertEl.style.display = 'block';
}

async function testSftpConnection() {
    const data = getSftpFormData();
    if (!data.host) {
        showSftpAlert('Please enter a server host / IP address.', 'error');
        return;
    }
    if (!data.username) {
        showSftpAlert('Please enter a username.', 'error');
        return;
    }

    const testBtn = document.getElementById('btn-sftp-test');
    const spinner = document.getElementById('sftp-test-btn-spinner');
    const btnText = document.getElementById('sftp-test-btn-text');

    if (testBtn) testBtn.disabled = true;
    if (spinner) spinner.style.display = 'inline-block';
    if (btnText) btnText.textContent = 'Testing...';
    showSftpAlert('Initiating SSH handshake and testing credentials...', 'info');

    try {
        const res = await fetch('/api/sftp/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        let result = {};
        try {
            result = await res.json();
        } catch {
            result = { success: false, errorMessage: `Server returned HTTP ${res.status}` };
        }
        if (result.success) {
            showSftpAlert(`✅ Connected successfully! (Latency: ${result.latencyMs}ms, Server: ${result.serverVersion || 'SSH-2.0'})`, 'success');
        } else {
            showSftpAlert(`❌ Connection failed: ${result.errorMessage || result.error || 'Unknown error'}`, 'error');
        }
    } catch (err) {
        showSftpAlert(`❌ Connection test error: ${err.message}`, 'error');
    } finally {
        if (testBtn) testBtn.disabled = false;
        if (spinner) spinner.style.display = 'none';
        if (btnText) btnText.textContent = '⚡ Test Connection';
    }
}

async function submitSftpConnect() {
    const data = getSftpFormData();
    if (!data.host) {
        showSftpAlert('Please enter a server host / IP address.', 'error');
        return;
    }
    if (!data.username) {
        showSftpAlert('Please enter a username.', 'error');
        return;
    }

    const connectBtn = document.getElementById('btn-sftp-connect');
    const spinner = document.getElementById('sftp-connect-btn-spinner');
    const btnText = document.getElementById('sftp-connect-btn-text');

    if (connectBtn) connectBtn.disabled = true;
    if (spinner) spinner.style.display = 'inline-block';
    if (btnText) btnText.textContent = 'Connecting...';
    showSftpAlert('Connecting to SFTP server...', 'info');

    try {
        const res = await fetch('/api/sftp/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        let result = {};
        try {
            result = await res.json();
        } catch {
            result = { success: false, errorMessage: `Server returned HTTP ${res.status}` };
        }
        if (!result.success) {
            showSftpAlert(`❌ Connect failed: ${result.errorMessage || result.error || 'Check credentials and host.'}`, 'error');
            return;
        }

        // Save connection profile if requested
        const saveChk = document.getElementById('sftp-chk-save-profile');
        const rememberChk = document.getElementById('sftp-chk-remember-creds');
        const modal = document.getElementById('modal-sftp');
        const editId = modal ? modal.getAttribute('data-edit-id') : null;

        if (saveChk && saveChk.checked) {
            const shouldRemember = rememberChk && rememberChk.checked;
            const profile = {
                id: editId || `prof_${Date.now()}`,
                name: data.connectionName || `${data.username}@${data.host}`,
                host: data.host,
                port: data.port,
                username: data.username,
                authType: data.authType,
                initialPath: data.initialPath,
                password: shouldRemember ? data.password : null,
                privateKeyContent: shouldRemember ? data.privateKeyContent : null,
                privateKeyPassphrase: shouldRemember ? data.privateKeyPassphrase : null
            };

            const existingIdx = sftpSavedProfiles.findIndex(p => p.id === profile.id);
            if (existingIdx >= 0) {
                sftpSavedProfiles[existingIdx] = profile;
            } else {
                sftpSavedProfiles.push(profile);
            }
            saveSftpProfilesToStorage();
        }

        closeSftpModal();
        await refreshSftpSessionsList();

        // Navigate to the remote directory
        const sftpPath = `sftp://${result.connectionId}${result.currentPath || '/'}`;
        navigateTo(sftpPath);
        showToast(`Connected to ${result.name || data.host} 🌐`, '✅');
    } catch (err) {
        showSftpAlert(`❌ Connect error: ${err.message}`, 'error');
    } finally {
        if (connectBtn) connectBtn.disabled = false;
        if (spinner) spinner.style.display = 'none';
        if (btnText) btnText.textContent = 'Connect';
    }
}

async function connectSavedProfile(profileId) {
    const prof = getSavedProfileById(profileId);
    if (!prof) return;

    // If credentials are saved, connect directly
    const hasCreds = (prof.authType === 'password' && prof.password) ||
                     (prof.authType === 'key' && prof.privateKeyContent);

    if (hasCreds) {
        showToast(`Connecting to ${prof.name}... ⏳`, '🌐');
        try {
            const res = await fetch('/api/sftp/connect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    connectionName: prof.name,
                    host: prof.host,
                    port: prof.port,
                    username: prof.username,
                    authType: prof.authType,
                    password: prof.password,
                    privateKeyContent: prof.privateKeyContent,
                    privateKeyPassphrase: prof.privateKeyPassphrase,
                    initialPath: prof.initialPath
                })
            });
            let result = {};
            try {
                result = await res.json();
            } catch {
                result = { success: false, errorMessage: `Server returned HTTP ${res.status}` };
            }
            if (result.success) {
                await refreshSftpSessionsList();
                const sftpPath = `sftp://${result.connectionId}${result.currentPath || '/'}`;
                navigateTo(sftpPath);
                showToast(`Connected to ${prof.name} 🌐`, '✅');
                return;
            } else {
                showToast(`Connect failed: ${result.errorMessage || result.error || 'Server unavailable'}`, '⚠️');
            }
        } catch (err) {
            showToast(`Connection failed: ${err.message}`, '❌');
        }
    }

    // Prompt user for credentials by opening pre-filled modal
    openSftpModal(prof);
}

async function disconnectSftpSession(connectionId, e) {
    if (e) {
        e.stopPropagation();
        e.preventDefault();
    }
    try {
        await fetch('/api/sftp/disconnect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ connectionId })
        });
        showToast('SFTP session disconnected ⏏️', 'ℹ️');
        await refreshSftpSessionsList();

        // If active view is on this session, go back home
        if (currentPath.startsWith('sftp://' + connectionId)) {
            goHome();
        }
    } catch (err) {
        console.error(err);
    }
}

function deleteSavedSftpProfile(profileId, e) {
    if (e) {
        e.stopPropagation();
        e.preventDefault();
    }
    sftpSavedProfiles = sftpSavedProfiles.filter(p => p.id !== profileId);
    saveSftpProfilesToStorage();
    renderSftpSidebar();
    showToast('Saved SFTP connection removed', '🗑️');
}

function handleFavoritesDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    const zone = document.getElementById('favorites-list');
    if (zone) zone.classList.add('drag-over');
    if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
    }
}

function handleFavoritesDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    const zone = document.getElementById('favorites-list');
    if (zone) zone.classList.remove('drag-over');
}

function handleFavoritesDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    const zone = document.getElementById('favorites-list');
    if (zone) zone.classList.remove('drag-over');

    const sep = isWindows ? '\\' : '/';
    let pathsToPin = [];

    if (draggedVenElItems && draggedVenElItems.length > 0) {
        pathsToPin = draggedVenElItems.slice();
    } else if (selectedItems && selectedItems.length > 0) {
        pathsToPin = selectedItems.map(function(i) {
            return i.path || (currentPath.endsWith(sep) ? currentPath + i.name : currentPath + sep + i.name);
        });
    } else if (selectedItem) {
        pathsToPin = [selectedItem.path || (currentPath.endsWith(sep) ? currentPath + selectedItem.name : currentPath + sep + selectedItem.name)];
    }

    let addedCount = 0;
    pathsToPin.forEach(function(targetPath) {
        if (!targetPath) return;
        if (userBookmarks.some(function(b) { return b.path === targetPath; })) return;

        const name = targetPath.split(sep).filter(Boolean).pop() || targetPath;
        const dotIdx = name.lastIndexOf('.');
        const ext = dotIdx > 0 ? name.substring(dotIdx).toUpperCase() : '';
        const matchingItem = currentItems.find(function(it) { return it.name === name; });
        const isDir = matchingItem ? matchingItem.type === 'Directory' : (!ext || ext.length > 6);
        const visual = typeof getFileVisual === 'function' ? getFileVisual(name, isDir) : { icon: isDir ? '📁' : '📄' };

        userBookmarks.push({
            name: name,
            path: targetPath,
            icon: visual.icon || (isDir ? '📁' : '📄'),
            isDir: isDir,
            ext: ext,
            isDefault: false
        });
        addedCount++;
    });

    if (addedCount > 0) {
        saveBookmarks();
        renderBookmarks();
        showToast('Pinned ' + addedCount + ' item' + (addedCount > 1 ? 's' : '') + ' to Favorites ⭐', '⭐');
    }
}

function togglePinCurrentFolder() {
    const existingIndex = userBookmarks.findIndex(function(b) { return b.path === currentPath; });
    const sep = isWindows ? '\\' : '/';
    const folderName = currentPath.split(sep).filter(Boolean).pop() || currentPath;
    if (existingIndex >= 0) {
        userBookmarks.splice(existingIndex, 1);
        showToast('Unpinned "' + folderName + '"', '☆');
    } else {
        userBookmarks.push({
            name: folderName,
            path: currentPath,
            icon: '📁',
            isDir: true,
            isDefault: false
        });
        showToast('Pinned "' + folderName + '" to Favorites ⭐', '⭐');
    }
    saveBookmarks();
    renderBookmarks();
}

function removeBookmark(targetPath) {
    userBookmarks = userBookmarks.filter(function(b) { return b.path !== targetPath; });
    saveBookmarks();
    renderBookmarks();
    showToast('Removed bookmark', '🗑️');
}

function togglePinSelectedItem() {
    hideContextMenu();
    const sep = isWindows ? '\\' : '/';
    let target = currentPath;
    let name = currentPath.split(sep).filter(Boolean).pop() || currentPath;
    let isDir = true;
    let ext = '';

    if (selectedItem) {
        target = selectedItem.path || (currentPath.endsWith(sep) ? currentPath + selectedItem.name : currentPath + sep + selectedItem.name);
        name = selectedItem.name;
        isDir = selectedItem.type === 'Directory';
        const dotIdx = name.lastIndexOf('.');
        ext = dotIdx > 0 ? name.substring(dotIdx).toUpperCase() : '';
    }

    const idx = userBookmarks.findIndex(function(b) { return b.path === target; });
    if (idx >= 0) {
        userBookmarks.splice(idx, 1);
        showToast('Unpinned "' + name + '"', '☆');
    } else {
        const visual = typeof getFileVisual === 'function' ? getFileVisual(name, isDir) : { icon: isDir ? '📁' : '📄' };
        userBookmarks.push({
            name: name,
            path: target,
            icon: visual.icon || (isDir ? '📁' : '📄'),
            isDir: isDir,
            ext: ext,
            isDefault: false
        });
        showToast('Pinned "' + name + '" to Favorites ⭐', '⭐');
    }
    saveBookmarks();
    renderBookmarks();
}

function togglePinPreviewItem() {
    if (!activePreviewPath) return;
    const sep = isWindows ? '\\' : '/';
    const target = activePreviewPath;
    const name = target.split(sep).filter(Boolean).pop() || target;
    const isDir = activePreviewIsDir;
    const dotIdx = name.lastIndexOf('.');
    const ext = dotIdx > 0 ? name.substring(dotIdx).toUpperCase() : '';

    const idx = userBookmarks.findIndex(function(b) { return b.path === target; });
    if (idx >= 0) {
        userBookmarks.splice(idx, 1);
        showToast('Unpinned "' + name + '"', '☆');
    } else {
        const visual = typeof getFileVisual === 'function' ? getFileVisual(name, isDir) : { icon: isDir ? '📁' : '📄' };
        userBookmarks.push({
            name: name,
            path: target,
            icon: visual.icon || (isDir ? '📁' : '📄'),
            isDir: isDir,
            ext: ext,
            isDefault: false
        });
        showToast('Pinned "' + name + '" to Favorites ⭐', '⭐');
    }
    saveBookmarks();
    renderBookmarks();
}

function updatePreviewActionButtons(fullPath, isDir) {
    const pinBtn = document.getElementById('preview-pin-btn');
    const copyImportBtn = document.getElementById('preview-copy-import-btn');
    const terminalBtn = document.getElementById('preview-terminal-btn');
    const editBtn = document.getElementById('preview-edit-btn');
    const saveBtn = document.getElementById('preview-save-btn');
    const cancelBtn = document.getElementById('preview-cancel-btn');

    if (fullPath) {
        const isText = !isDir && isEditableTextFile(fullPath);
        if (editBtn) editBtn.style.display = isText && !isInlineEditorActive ? 'inline-flex' : 'none';
        if (saveBtn) saveBtn.style.display = isInlineEditorActive ? 'inline-flex' : 'none';
        if (cancelBtn) cancelBtn.style.display = isInlineEditorActive ? 'inline-flex' : 'none';

        if (pinBtn) {
            const isPinned = userBookmarks.some(function(b) { return b.path === fullPath; });
            pinBtn.style.display = 'inline-flex';
            if (isPinned) {
                pinBtn.classList.add('pinned');
                pinBtn.textContent = '★';
                pinBtn.title = 'Unpin this item from Favorites';
            } else {
                pinBtn.classList.remove('pinned');
                pinBtn.textContent = '☆';
                pinBtn.title = 'Pin this item to Favorites';
            }
        }
        if (copyImportBtn) {
            copyImportBtn.style.display = 'inline-flex';
            copyImportBtn.title = isDir ? 'Copy Relative Path (⌥⇧C)' : 'Copy Smart Import Statement (⌥⇧I)';
        }
        if (terminalBtn) {
            terminalBtn.style.display = 'inline-flex';
        }
    } else {
        if (editBtn) editBtn.style.display = 'none';
        if (saveBtn) saveBtn.style.display = 'none';
        if (cancelBtn) cancelBtn.style.display = 'none';
        if (pinBtn) pinBtn.style.display = 'none';
        if (copyImportBtn) copyImportBtn.style.display = 'none';
        if (terminalBtn) terminalBtn.style.display = 'none';
    }
}

// ══════════════════════════════════════════════════════════
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
        if (sftpInfo) {
            let res = await fetch(`/api/sftp/read?connectionId=${encodeURIComponent(sftpInfo.connectionId)}&path=${encodeURIComponent(sftpInfo.remotePath)}`).catch(() => null);
            if (!res || !res.ok) {
                showToast('Unable to open remote file for editing', '⚠️');
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
                    '<span class="commander-item-icon">' + visual.icon + '</span>' +
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
// ⌨️ GLOBAL EVENT LISTENERS & SHORTCUTS
// ══════════════════════════════════════════════════════════
document.addEventListener('click', function(e) {
    hideContextMenu();
    closeViewMenu();
    clearTypeAhead();
    const container = document.querySelector('.path-bar-container');
    if (container && !container.contains(e.target)) {
        closePathDropdown();
    }
    if (!e.target.closest('.menubar-item')) {
        closeAllMenus();
    }
});

// 🖱️ Mouse Back & Forward Thumb Buttons (Buttons 3 & 4)
window.addEventListener('mouseup', function(e) {
    if (e.button === 3) {
        e.preventDefault();
        e.stopPropagation();
        goBack();
    } else if (e.button === 4) {
        e.preventDefault();
        e.stopPropagation();
        goForward();
    }
});

document.addEventListener('keydown', function(e) {
    const isEditing = ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) ||
                      document.activeElement.isContentEditable ||
                      !!document.activeElement.closest('.inline-editor-container') ||
                      !!document.activeElement.closest('#terminal-body') ||
                      !!document.activeElement.closest('.xterm');

    if (e.key === 'Escape') {
        if (isInlineEditorActive) {
            cancelInlineEditor();
            return;
        }
        closeSftpModal();
        closeAiAssistantModal();
        closeAllMenus();
        clearTypeAhead();
        closePathDropdown();
        closeViewMenu();
        hideModals();
        hideContextMenu();
        closeQuickLook();
        exitPathEditMode();
        clearSearch();
        return;
    }

    // Cmd+K / Ctrl+K: Quick Connect to SFTP Server
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        openSftpModal();
        return;
    }

    // Cmd+S / Ctrl+S: Save In-Line Editor or Quick Look Editor
    if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
        if (isInlineEditorActive) {
            e.preventDefault();
            saveInlineEditor();
            return;
        }
        if (isQlEditorActive) {
            e.preventDefault();
            saveQuickLookEditor();
            return;
        }
    }

    // Cmd+E / Ctrl+E: Toggle In-Line Editor for current preview file
    if ((e.metaKey || e.ctrlKey) && (e.key === 'e' || e.key === 'E')) {
        if (activePreviewPath && !isEditing) {
            e.preventDefault();
            toggleInlineEditor();
            return;
        }
    }

    // Alt+D / Option+D: Toggle Dual-Pane Commander Mode
    if (e.altKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        toggleDualPaneMode();
        return;
    }

    // Tab: In Dual-Pane mode, switch active pane
    if (e.key === 'Tab' && isDualPane && !isEditing) {
        e.preventDefault();
        switchActivePane();
        return;
    }

    // F5: In Dual-Pane mode, copy to other pane
    if (e.key === 'F5' && isDualPane && !isEditing) {
        e.preventDefault();
        commanderCopy();
        return;
    }

    // F6: In Dual-Pane mode, move to other pane
    if (e.key === 'F6' && isDualPane && !isEditing) {
        e.preventDefault();
        commanderMove();
        return;
    }

    // Cmd+Shift+A (Mac) or Ctrl+Shift+A (Win): Open VenEl AI Assistant
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
        e.preventDefault();
        openAiAssistantModal();
        return;
    }

    // If Delete modal is active, Enter immediately confirms deletion
    const modalDelete = document.getElementById('modal-delete');
    if (modalDelete && modalDelete.style.display === 'flex') {
        if (e.key === 'Enter') {
            e.preventDefault();
            submitDelete();
            return;
        }
    }

    // If Compress modal is active, Enter immediately confirms compression
    const modalCompress = document.getElementById('modal-compress');
    if (modalCompress && modalCompress.style.display === 'flex') {
        if (e.key === 'Enter') {
            e.preventDefault();
            submitCompress();
            return;
        }
    }

    // If any modal is visible, block global background shortcuts from firing
    const anyActiveModal = document.querySelector('.modal-overlay[style*="display: flex"]');
    if (anyActiveModal && !isEditing) {
        return;
    }

    if (isEditing) return;

    // Ctrl+F1 (Win/Linux) or Cmd+Option+T (Mac): Toggle Compact Bars
    const isCompactShortcutMac = e.metaKey && e.altKey && (e.key === 't' || e.key === 'T');
    const isCompactShortcutWin = e.ctrlKey && e.key === 'F1';
    if (isCompactShortcutMac || isCompactShortcutWin) {
        e.preventDefault();
        toggleCompactBars();
        return;
    }

    // Alt+T / Option+T or Ctrl+` : Open Integrated Terminal
    const isTerminalShortcut = (e.altKey && (e.key === 't' || e.key === 'T') && !e.metaKey && !e.ctrlKey) ||
                               ((e.ctrlKey || e.metaKey) && (e.key === '`' || e.code === 'Backquote'));
    if (isTerminalShortcut) {
        e.preventDefault();
        openTerminalAtSelection();
        return;
    }

    // Option+Shift+C (Mac) or Alt+Shift+C (Win): Copy Relative Path
    if (e.altKey && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
        e.preventDefault();
        copyPathToClipboard(true);
        return;
    }

    // Option+Shift+I (Mac) or Alt+Shift+I (Win): Copy Smart Import Statement
    if (e.altKey && e.shiftKey && (e.key === 'I' || e.key === 'i')) {
        e.preventDefault();
        copySmartImportAtSelection();
        return;
    }

    // Alt+P (Windows Explorer) or Cmd+Shift+P / Cmd+Option+P: Toggle Preview Pane
    const isPreviewShortcutMac = (e.metaKey && e.shiftKey && (e.key === 'p' || e.key === 'P')) || (e.metaKey && e.altKey && (e.key === 'p' || e.key === 'P'));
    const isPreviewShortcutWin = e.altKey && (e.key === 'p' || e.key === 'P') && !e.ctrlKey;
    if (isPreviewShortcutMac || isPreviewShortcutWin) {
        e.preventDefault();
        togglePreview();
        return;
    }

    // Alt+B or Cmd+Shift+B: Toggle Sidebar
    const isSidebarShortcutMac = e.metaKey && e.shiftKey && (e.key === 'b' || e.key === 'B');
    const isSidebarShortcutWin = e.altKey && (e.key === 'b' || e.key === 'B');
    if (isSidebarShortcutMac || isSidebarShortcutWin) {
        e.preventDefault();
        toggleSidebarRail();
        return;
    }

    // ? or F1: Open Feature Guide & Keyboard Shortcuts
    if ((e.key === '?' || (e.shiftKey && e.key === '/') || e.key === 'F1') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        openHelpModal();
        return;
    }

    // Cmd+Shift+. (Mac) or Ctrl+H / Ctrl+Shift+. (Win/Linux): Toggle Hidden Files
    const isHiddenShortcutMac = e.metaKey && e.shiftKey && (e.key === '.' || e.code === 'Period');
    const isHiddenShortcutWin = (e.ctrlKey && (e.key === 'h' || e.key === 'H')) || (e.ctrlKey && e.shiftKey && (e.key === '.' || e.code === 'Period'));
    if (isHiddenShortcutMac || isHiddenShortcutWin) {
        e.preventDefault();
        toggleShowHiddenFiles();
        return;
    }

    // Ctrl+T / Cmd+T: New Tab
    if ((e.ctrlKey || e.metaKey) && (e.key === 't' || e.key === 'T')) {
        e.preventDefault();
        addNewTab();
        return;
    }

    // Ctrl+W / Cmd+W: Close Tab
    if ((e.ctrlKey || e.metaKey) && (e.key === 'w' || e.key === 'W')) {
        e.preventDefault();
        closeCurrentTab();
        return;
    }

    // Ctrl+Tab / Ctrl+Shift+Tab: Cycle Tabs
    if ((e.ctrlKey || e.metaKey) && e.key === 'Tab') {
        e.preventDefault();
        cycleTabs(e.shiftKey ? -1 : 1);
        return;
    }

    // Alt+1 to Alt+9: Switch to specific tab index
    if (e.altKey && e.key >= '1' && e.key <= '9') {
        const targetIdx = parseInt(e.key, 10) - 1;
        if (targetIdx < tabs.length) {
            e.preventDefault();
            switchToTab(tabs[targetIdx].id);
            return;
        }
    }

    // Instant '/' quick filter hotkey
    if (e.key === '/') {
        e.preventDefault();
        const searchInput = document.getElementById('search');
        if (searchInput) {
            searchInput.focus();
            searchInput.select();
        }
        return;
    }

    // Spacebar: Quick Look (Finder style) or Type-Ahead space
    if (e.code === 'Space') {
        if (typeAheadBuffer.length > 0) {
            e.preventDefault();
            handleTypeAhead(' ');
            return;
        }
        e.preventDefault();
        toggleQuickLook();
        return;
    }

    // ══════════════════════════════════════════════════════════
    // 🧭 NATIVE OS NAVIGATION SHORTCUTS (Windows & macOS)
    // ══════════════════════════════════════════════════════════

    // 1. Level Up / Enclosing Folder:
    // macOS: Cmd+Up
    // Windows/Linux: Alt+Up
    // Universal: Shift+Backspace or Alt+Backspace
    const isUpShortcut = (e.metaKey && e.key === 'ArrowUp' && !e.altKey && !e.ctrlKey) ||
                         (e.altKey && e.key === 'ArrowUp' && !e.metaKey && !e.ctrlKey) ||
                         ((e.shiftKey || e.altKey) && e.key === 'Backspace' && !e.metaKey && !e.ctrlKey);
    if (isUpShortcut) {
        e.preventDefault();
        goUp();
        return;
    }

    // 2. Back in History:
    // macOS: Cmd+[
    // Windows/Linux: Alt+Left
    // Hardware / Keyboard: BrowserBack
    const isBackShortcut = (e.metaKey && (e.key === '[' || e.code === 'BracketLeft') && !e.altKey && !e.ctrlKey) ||
                           (e.altKey && e.key === 'ArrowLeft' && !e.metaKey && !e.ctrlKey) ||
                           (e.key === 'BrowserBack');
    if (isBackShortcut) {
        e.preventDefault();
        goBack();
        return;
    }

    // 3. Forward in History:
    // macOS: Cmd+]
    // Windows/Linux: Alt+Right
    // Hardware / Keyboard: BrowserForward
    const isForwardShortcut = (e.metaKey && (e.key === ']' || e.code === 'BracketRight') && !e.altKey && !e.ctrlKey) ||
                              (e.altKey && e.key === 'ArrowRight' && !e.metaKey && !e.ctrlKey) ||
                              (e.key === 'BrowserForward');
    if (isForwardShortcut) {
        e.preventDefault();
        goForward();
        return;
    }

    // 4. Backspace Key (Plain, no modifiers):
    // In Type-Ahead mode: edits the quick-search buffer
    // In normal view: behaves like native OS file explorer:
    // Navigates Back in history, or Up to parent folder if at start of history
    if (e.key === 'Backspace' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        if (typeAheadBuffer.length > 0) {
            e.preventDefault();
            handleTypeAheadBackspace();
            return;
        }
        e.preventDefault();
        handleNativeBackOrUp(false);
        return;
    }

    // 5. Open / Enter Selected Folder or File:
    // Universal: Enter
    // macOS: Cmd+Down or Cmd+O
    const isOpenShortcut = (e.key === 'Enter' && !e.altKey && !e.metaKey && !e.ctrlKey) ||
                           (e.metaKey && e.key === 'ArrowDown' && !e.altKey && !e.ctrlKey) ||
                           (e.metaKey && (e.key === 'o' || e.key === 'O') && !e.shiftKey);
    if (isOpenShortcut && selectedItem) {
        e.preventDefault();
        handleDoubleClick(selectedItem.name, selectedItem.type === 'Directory');
        return;
    }

    // 6. Go to Folder / Focus Address Bar:
    // macOS: Cmd+Shift+G
    // Windows: Ctrl+L or Alt+D
    const isGoToFolderShortcut = (e.metaKey && e.shiftKey && (e.key === 'g' || e.key === 'G')) ||
                                 ((e.ctrlKey || e.metaKey) && (e.key === 'l' || e.key === 'L') && !e.shiftKey) ||
                                 (e.altKey && (e.key === 'd' || e.key === 'D') && !e.ctrlKey);
    if (isGoToFolderShortcut) {
        e.preventDefault();
        enterPathEditMode();
        return;
    }

    // 7. Create New Folder:
    // macOS: Cmd+Shift+N
    // Windows/Linux: Ctrl+Shift+N
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        showNewFolderModal();
        return;
    }

    // 8. Arrow Keys Selection Navigation (Plain / Shift range selection):
    if (e.key === 'ArrowDown' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        navigateSelection(1, e.shiftKey);
        return;
    }
    if (e.key === 'ArrowUp' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        navigateSelection(-1, e.shiftKey);
        return;
    }
    if (e.key === 'ArrowRight' && !e.altKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        navigateSelection(1, e.shiftKey);
        return;
    }
    if (e.key === 'ArrowLeft' && !e.altKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        navigateSelection(-1, e.shiftKey);
        return;
    }
    if (e.key === 'Home' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        navigateSelection('first', e.shiftKey);
        return;
    }
    if (e.key === 'End' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        navigateSelection('last', e.shiftKey);
        return;
    }

    // 9. F2: Rename
    if (e.key === 'F2') {
        e.preventDefault();
        renameSelectedItem();
        return;
    }

    // 10. Native Safe Deletion:
    // macOS: Cmd+Delete / Cmd+Backspace moves item to Trash (plain delete/backspace is protected for navigation)
    // Windows/Linux: Delete key (or Shift+Delete) moves item to Recycle Bin
    const isDeleteKey = isMac
        ? (e.metaKey && (e.key === 'Backspace' || e.key === 'Delete' || e.code === 'Backspace' || e.code === 'Delete'))
        : ((e.key === 'Delete' || e.code === 'Delete') && !e.altKey && !e.metaKey);
    if (isDeleteKey) {
        const hasSelection = (selectedItems && selectedItems.length > 0) || selectedItem;
        if (hasSelection) {
            e.preventDefault();
            deleteSelectedItem();
            return;
        }
    }

    // Alt+Enter: Properties
    if (e.altKey && e.key === 'Enter') {
        e.preventDefault();
        showPropertiesModal();
        return;
    }

    // Ctrl+B / Cmd+B: Toggle Sidebar Rail
    if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        toggleSidebarRail();
        return;
    }

    // Ctrl+C: Copy
    if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        copySelectedItem();
        return;
    }

    // Ctrl+X: Cut
    if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
        cutSelectedItem();
        return;
    }

    // Ctrl+V: Paste
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        pasteClipboardItem();
        return;
    }

    // Ctrl+A / Cmd+A: Select All
    if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        selectAllItems();
        return;
    }

    // Ctrl+Shift+R / Cmd+Shift+R: Batch Rename
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        showBatchRenameModal();
        return;
    }

    // Incremental Type-to-Select / Quick Jump (Finder & Explorer style)
    let typedChar = null;
    if (e.key.length === 1) {
        typedChar = e.key;
    } else if (/^Key[A-Za-z]$/.test(e.key)) {
        typedChar = e.key.slice(3).toLowerCase();
    } else if (/^Digit[0-9]$/.test(e.key)) {
        typedChar = e.key.slice(5);
    }

    if (typedChar && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (typedChar === '/' && typeAheadBuffer.length === 0) return;
        if (typedChar === '?' && typeAheadBuffer.length === 0) return;
        e.preventDefault();
        handleTypeAhead(typedChar);
        return;
    }
});

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
// 🛠️ UTILITIES
// ══════════════════════════════════════════════════════════
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    } catch {
        return dateStr;
    }
}

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function escapePath(path) {
    if (!path) return '';
    return path.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function showToast(message, icon = '💡') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = '<span style="font-size: 16px;">' + icon + '</span><span>' + escapeHtml(message) + '</span>';
    document.body.appendChild(toast);

    setTimeout(function() {
        toast.style.transition = 'opacity 0.25s, transform 0.25s';
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(15px)';
        setTimeout(function() { toast.remove(); }, 250);
    }, 2500);
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
renderTabs();

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

// ══════════════════════════════════════════════════════════
// 🖱️ DRAG & DROP SYSTEM (Internal Move/Copy + Desktop Upload)
// ══════════════════════════════════════════════════════════
let draggedVenElItems = [];

function handleItemDragStart(e, name, isDir) {
    const isAlreadySelected = selectedItems.some(function(i) { return i.name === name; });
    if (!isAlreadySelected) {
        const item = currentItems.find(function(i) { return i.name === name; }) || { name: name, type: isDir ? 'Directory' : 'File' };
        selectedItems = [item];
        selectedItem = item;
        syncItemSelectionDOM();
        updateSelectionState();
    }

    const sep = isWindows ? '\\' : '/';
    draggedVenElItems = selectedItems.map(function(i) {
        return i.path || (currentPath.endsWith(sep) ? currentPath + i.name : currentPath + sep + i.name);
    });

    if (e.dataTransfer) {
        e.dataTransfer.setData('application/json', JSON.stringify({
            type: 'venel-internal-items',
            items: draggedVenElItems
        }));
        e.dataTransfer.effectAllowed = 'copyMove';

        // Developer Productivity: Drag-and-drop into VS Code editor for smart import statement or relative path insertion
        if (draggedVenElItems.length > 0) {
            const firstItemPath = draggedVenElItems[0];
            const importSnippet = generateSmartImportSnippet(firstItemPath, currentPath);
            e.dataTransfer.setData('text/plain', importSnippet);
            e.dataTransfer.setData('text/uri-list', 'file://' + firstItemPath);
            try {
                e.dataTransfer.setData('application/vnd.code.uri-list', JSON.stringify(['file://' + firstItemPath]));
            } catch {}
        }
    }

    const elem = e.currentTarget;
    if (elem) elem.classList.add('dragging');
}

function handleItemDragEnd(e) {
    draggedVenElItems = [];
    const elem = e.currentTarget;
    if (elem) elem.classList.remove('dragging');
    document.querySelectorAll('.drag-over').forEach(function(el) { el.classList.remove('drag-over'); });
    document.querySelectorAll('.dragging').forEach(function(el) { el.classList.remove('dragging'); });
}

function handleFolderDragOver(e, folderName) {
    const sep = isWindows ? '\\' : '/';
    const targetPath = currentPath.endsWith(sep) ? currentPath + folderName : currentPath + sep + folderName;
    if (draggedVenElItems.includes(targetPath)) return;

    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
        e.dataTransfer.dropEffect = e.altKey ? 'copy' : 'move';
    }
    e.currentTarget.classList.add('drag-over');
}

function handleFolderDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

async function handleFolderDrop(e, folderName) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');

    const sep = isWindows ? '\\' : '/';
    const destinationDir = currentPath.endsWith(sep) ? currentPath + folderName : currentPath + sep + folderName;

    if (draggedVenElItems.length > 0) {
        const itemsToTransfer = draggedVenElItems.slice();
        draggedVenElItems = [];
        const isCopy = e.altKey;
        const endpoint = isCopy ? '/api/files/copy' : '/api/files/move';

        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: itemsToTransfer, destinationDir: destinationDir })
            });
            const result = await res.json();
            if (!res.ok || result.error) {
                showToast('Transfer failed: ' + (result.error || 'Server error'), '⚠️');
            } else {
                showToast((isCopy ? 'Copied ' : 'Moved ') + itemsToTransfer.length + ' item(s) to ' + folderName, '📂');
                refreshCurrentFolder();
            }
        } catch (err) {
            showToast('Transfer error: ' + (err.message || err), '⚠️');
        }
        return;
    }

    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        await uploadFileList(e.dataTransfer.files, destinationDir);
    }
}

function handleBreadcrumbDragOver(e, targetPath) {
    if (targetPath === currentPath) return;
    if (draggedVenElItems.includes(targetPath)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
        e.dataTransfer.dropEffect = e.altKey ? 'copy' : 'move';
    }
    e.currentTarget.classList.add('drag-over');
}

function handleBreadcrumbDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

async function handleBreadcrumbDrop(e, targetPath) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');

    if (draggedVenElItems.length > 0) {
        const itemsToTransfer = draggedVenElItems.slice();
        draggedVenElItems = [];
        const isCopy = e.altKey;
        const endpoint = isCopy ? '/api/files/copy' : '/api/files/move';

        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: itemsToTransfer, destinationDir: targetPath })
            });
            const result = await res.json();
            if (!res.ok || result.error) {
                showToast('Transfer failed: ' + (result.error || 'Server error'), '⚠️');
            } else {
                const targetName = targetPath.split(/[\/\\]/).filter(Boolean).pop() || targetPath;
                showToast((isCopy ? 'Copied ' : 'Moved ') + itemsToTransfer.length + ' item(s) to ' + targetName, '📂');
                refreshCurrentFolder();
            }
        } catch (err) {
            showToast('Transfer error: ' + (err.message || err), '⚠️');
        }
        return;
    }

    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        await uploadFileList(e.dataTransfer.files, targetPath);
    }
}

function handleBookmarkDragOver(e, targetPath) {
    if (draggedVenElItems.includes(targetPath)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
        e.dataTransfer.dropEffect = e.altKey ? 'copy' : 'move';
    }
    e.currentTarget.classList.add('drag-over');
}

function handleBookmarkDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

async function handleBookmarkDrop(e, targetPath) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');

    if (draggedVenElItems.length > 0) {
        const itemsToTransfer = draggedVenElItems.slice();
        draggedVenElItems = [];
        const isCopy = e.altKey;
        const endpoint = isCopy ? '/api/files/copy' : '/api/files/move';

        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: itemsToTransfer, destinationDir: targetPath })
            });
            const result = await res.json();
            if (!res.ok || result.error) {
                showToast('Transfer failed: ' + (result.error || 'Server error'), '⚠️');
            } else {
                const targetName = targetPath.split(/[\/\\]/).filter(Boolean).pop() || targetPath;
                showToast((isCopy ? 'Copied ' : 'Moved ') + itemsToTransfer.length + ' item(s) to ' + targetName, '⭐');
                refreshCurrentFolder();
            }
        } catch (err) {
            showToast('Transfer error: ' + (err.message || err), '⚠️');
        }
        return;
    }

    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        await uploadFileList(e.dataTransfer.files, targetPath);
    }
}

async function uploadFileList(files, targetDir) {
    if (!files || files.length === 0) return;
    const destDir = targetDir || currentPath;
    showToast('Uploading ' + files.length + ' file(s)...', '⏳');

    const payloadFiles = [];
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
            const base64 = await readFileAsBase64(file);
            payloadFiles.push({
                name: file.name,
                contentBase64: base64
            });
        } catch (err) {
            console.error('Failed to read file:', file.name, err);
        }
    }

    if (payloadFiles.length === 0) return;

    try {
        const res = await fetch('/api/files/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ destinationDir: destDir, files: payloadFiles })
        });
        const result = await res.json();
        if (!res.ok || result.error) {
            showToast('Upload failed: ' + (result.error || 'Server error'), '⚠️');
        } else {
            showToast('Successfully added ' + result.count + ' file(s)!', '📂');
            refreshCurrentFolder();
        }
    } catch (err) {
        showToast('Upload error: ' + (err.message || err), '⚠️');
    }
}

function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function() {
            const dataUrl = reader.result;
            const base64 = dataUrl.split(',')[1] || '';
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function setupWindowDragAndDrop() {
    const overlay = document.getElementById('dropOverlay');
    const targetName = document.getElementById('dropOverlayTargetName');
    let dragCounter = 0;

    window.addEventListener('dragenter', function(e) {
        if (draggedVenElItems.length > 0) return;
        if (!e.dataTransfer || !e.dataTransfer.types.includes('Files')) return;

        dragCounter++;
        if (overlay) {
            if (targetName) targetName.textContent = currentPath;
            overlay.classList.add('active');
        }
    });

    window.addEventListener('dragleave', function(e) {
        if (draggedVenElItems.length > 0) return;
        dragCounter--;
        if (dragCounter <= 0) {
            dragCounter = 0;
            if (overlay) overlay.classList.remove('active');
        }
    });

    window.addEventListener('dragover', function(e) {
        if (draggedVenElItems.length > 0) return;
        if (!e.dataTransfer || !e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    });

    window.addEventListener('drop', async function(e) {
        dragCounter = 0;
        if (overlay) overlay.classList.remove('active');
        if (draggedVenElItems.length > 0) return;
        if (!e.dataTransfer || !e.dataTransfer.files || e.dataTransfer.files.length === 0) return;

        e.preventDefault();
        e.stopPropagation();
        await uploadFileList(e.dataTransfer.files, currentPath);
    });
}

// ══════════════════════════════════════════════════════════
// ✨ FLOATING GLASSMORPHIC HOVER CARD (TOOLTIP)
// ══════════════════════════════════════════════════════════
let hoverCardTimer = null;
let hoverCardCurrentTarget = null;
let lastMousePos = { x: 0, y: 0 };

function handleItemHoverEnter(e, itemEl) {
    hideHoverCard();
    hoverCardCurrentTarget = itemEl;
    lastMousePos = { x: e ? e.clientX : 0, y: e ? e.clientY : 0 };
    hoverCardTimer = setTimeout(function() {
        if (hoverCardCurrentTarget === itemEl) {
            showHoverCardForItem(itemEl, lastMousePos.x, lastMousePos.y);
        }
    }, 280);
}

function handleItemHoverLeave(e, itemEl) {
    if (hoverCardCurrentTarget === itemEl) {
        hideHoverCard();
    }
}

function handleItemHoverMove(e, itemEl) {
    if (e) {
        lastMousePos = { x: e.clientX, y: e.clientY };
    }
    const card = document.getElementById('file-hover-card');
    if (card && card.classList.contains('visible') && hoverCardCurrentTarget === itemEl) {
        positionHoverCard(card, lastMousePos.x, lastMousePos.y, itemEl);
    }
}

window.triggerItemHover = function(name) {
    const itemEl = name ? document.querySelector('.item[data-name="' + name + '"]') : document.querySelector('.item');
    if (itemEl) {
        hoverCardCurrentTarget = itemEl;
        itemEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        showHoverCardForItem(itemEl, 0, 0);
    }
};

function initHoverCard() {
    const filesContainer = document.getElementById('files');
    const card = document.getElementById('file-hover-card');
    if (!card) return;

    // Hide immediately when scrolling, clicking, dragging, or opening context menus
    const scrollContainer = document.getElementById('file-list-container') || filesContainer;
    if (scrollContainer) {
        scrollContainer.addEventListener('scroll', hideHoverCard, { passive: true });
    }
    window.addEventListener('scroll', hideHoverCard, { passive: true });
    window.addEventListener('resize', hideHoverCard, { passive: true });
    window.addEventListener('contextmenu', hideHoverCard);
    window.addEventListener('mousedown', function(e) {
        if (e.target && e.target.closest && e.target.closest('#file-hover-card')) return;
        hideHoverCard();
    });
    window.addEventListener('dragstart', hideHoverCard);
}

function hideHoverCard() {
    if (hoverCardTimer) {
        clearTimeout(hoverCardTimer);
        hoverCardTimer = null;
    }
    hoverCardCurrentTarget = null;
    const card = document.getElementById('file-hover-card');
    if (card) {
        card.classList.remove('visible');
        card.style.display = 'none';
    }
}

function showHoverCardForItem(itemEl, mouseX, mouseY) {
    const card = document.getElementById('file-hover-card');
    if (!card || !itemEl) return;

    const itemPath = itemEl.getAttribute('data-path');
    const itemName = itemEl.getAttribute('data-name');
    if (!itemName && !itemPath) return;

    // Find item in displayedItems or currentItems
    const item = (itemPath && (displayedItems || []).find(function(it) { return it.path === itemPath; })) ||
                 (displayedItems || []).find(function(it) { return it.name === itemName; }) ||
                 (currentItems || []).find(function(it) { return it.name === itemName; });
    if (!item) return;

    const isDir = item.type === 'Directory';
    const visual = getFileVisual(item.name, isDir);

    // 1. Icon & Header
    const iconEl = document.getElementById('hover-card-icon');
    const nameEl = document.getElementById('hover-card-name');
    const typeEl = document.getElementById('hover-card-type');
    if (iconEl) iconEl.textContent = visual.icon;
    if (nameEl) nameEl.textContent = item.name;
    if (typeEl) typeEl.textContent = visual.typeLabel || (isDir ? 'File folder' : 'File');

    // 2. Size & Modified
    const sizeEl = document.getElementById('hover-card-size');
    const modEl = document.getElementById('hover-card-modified');
    if (sizeEl) sizeEl.textContent = !isDir ? formatBytes(item.size) : '--';
    if (modEl) modEl.textContent = item.modified ? formatDate(item.modified) : '--';

    // 3. Git Status
    const gitRow = document.getElementById('hover-card-git-row');
    const gitText = document.getElementById('hover-card-git-text');
    const gitDot = document.getElementById('hover-card-git-dot');
    if (gitRow && gitText) {
        const gitCode = currentGitStatuses ? currentGitStatuses[item.name] : null;
        if (gitCode) {
            gitRow.style.display = 'flex';
            let gitLabel = 'Modified';
            let dotColor = '#ffeaa7';
            if (gitCode === 'M') { gitLabel = 'Modified (unstaged)'; dotColor = '#ffeaa7'; }
            else if (gitCode === 'U' || gitCode === '?') { gitLabel = 'Untracked'; dotColor = '#55efc4'; }
            else if (gitCode === 'A') { gitLabel = 'Added (staged)'; dotColor = '#00cec9'; }
            else if (gitCode === 'D') { gitLabel = 'Deleted'; dotColor = '#ff7675'; }
            else if (gitCode === 'R') { gitLabel = 'Renamed'; dotColor = '#74b9ff'; }
            else { gitLabel = 'Changed'; dotColor = '#a29bfe'; }

            gitText.textContent = gitLabel;
            if (gitDot) gitDot.style.color = dotColor;
        } else {
            gitRow.style.display = 'none';
        }
    }

    // 3b. AI Tokens
    const tokensRow = document.getElementById('hover-card-tokens-row');
    const tokenText = document.getElementById('hover-card-token-text');
    if (tokensRow && tokenText) {
        if (!isDir && item.size && item.size > 0 && item.size < 5 * 1024 * 1024) {
            const approxTokens = Math.max(1, Math.round(item.size / 3.8));
            tokenText.textContent = '✨ ~' + formatTokenCount(approxTokens);
            tokensRow.style.display = 'flex';
        } else {
            tokensRow.style.display = 'none';
        }
    }

    lastHoveredItem = item;

    // 4. Location / Full Path
    const locEl = document.getElementById('hover-card-location');
    if (locEl) {
        const sep = isWindows ? '\\' : '/';
        const fullLoc = (item.isSearchResult && item.directory)
            ? item.directory
            : ((item.isSearchResult && item.path)
                ? item.path.substring(0, item.path.lastIndexOf(sep))
                : currentPath);
        locEl.textContent = fullLoc || currentPath || '/';
        locEl.title = fullLoc || currentPath || '/';
    }

    card.style.display = 'block';
    positionHoverCard(card, mouseX, mouseY, itemEl);
    requestAnimationFrame(function() {
        card.classList.add('visible');
    });
}

function positionHoverCard(card, mouseX, mouseY, itemEl) {
    if (!mouseX || !mouseY || mouseX <= 0 || mouseY <= 0) {
        if (itemEl) {
            const r = itemEl.getBoundingClientRect();
            mouseX = Math.round(r.left + r.width / 2);
            mouseY = Math.round(r.bottom);
        } else {
            return;
        }
    }

    const cardRect = card.getBoundingClientRect();
    const cardWidth = cardRect.width || 280;
    const cardHeight = cardRect.height || 140;

    const padding = 12;
    let left = mouseX + 16;
    let top = mouseY + 16;

    // Flip horizontally if it would overflow right edge
    if (left + cardWidth > window.innerWidth - padding) {
        left = mouseX - cardWidth - 14;
    }

    // Flip vertically if it would overflow bottom edge
    if (top + cardHeight > window.innerHeight - padding) {
        top = mouseY - cardHeight - 12;
    }

    // Clamp within viewport
    left = Math.max(padding, Math.min(left, window.innerWidth - cardWidth - padding));
    top = Math.max(padding, Math.min(top, window.innerHeight - cardHeight - padding));

    card.style.left = left + 'px';
    card.style.top = top + 'px';
}

// ══════════════════════════════════════════════════════════
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
    document.getElementById('ai-target-icon').textContent = visual.icon;
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

// Initialize
try { fetchRoots(); } catch (e) { console.warn(e); }
try { initBookmarks(); } catch (e) { console.warn(e); }
try { initSidebarSections(); } catch (e) { console.warn(e); }
try { initIdeEnvironment(); } catch (e) { console.warn(e); }
try { initQuickFilterAndHiddenFiles(); } catch (e) { console.warn(e); }
try { initHoverCard(); } catch (e) { console.warn(e); }

const initialTab = (Array.isArray(tabs) && tabs.length > 0)
    ? (tabs.find(function(t) { return t && t.id === activeTabId; }) || tabs[0])
    : null;
const startPath = (initialTab && initialTab.path && initialTab.path !== '.')
    ? initialTab.path
    : (activeWorkingDirectory || (initialTab ? initialTab.path : '.') || '.');

navigateTo(startPath);
try { setView(currentViewMode); } catch (e) {}
try { setupWindowDragAndDrop(); } catch (e) {}
try { syncMenuShortcuts(); } catch (e) {}

// Restore saved panel states
const savedSidebarCollapsed = safeStorage.getItem('venel_sidebar_collapsed') === 'true';
if (savedSidebarCollapsed) toggleSidebarRail(true);
const savedPreviewCollapsed = safeStorage.getItem('venel_preview_collapsed') === 'true';
if (savedPreviewCollapsed) togglePreview(true);
if (typeof isCompactBars !== 'undefined' && isCompactBars) applyCompactBarsState();
updateDockStripVisibility();
updateViewMenuChecks();

// Update OS-specific tab shortcut badges
const badgeShortcut = document.getElementById('badge-tab-shortcut');
if (badgeShortcut) badgeShortcut.textContent = tabShortcutLabel;
const ctxShortcut = document.getElementById('ctx-new-tab-shortcut');
if (ctxShortcut) ctxShortcut.textContent = tabShortcutLabel;

// Initialize Resizable Splitters
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initSplitters();
    initDualPaneResizer();
} else {
    window.addEventListener('DOMContentLoaded', function() {
        initSplitters();
        initDualPaneResizer();
    });
}

// Restore saved dual-pane state
try {
    const savedDualPane = safeStorage.getItem('venel_dual_pane') === 'true';
    if (savedDualPane) toggleDualPaneMode(true);
} catch {}

// Initialize SFTP Remote Sessions & Saved Profiles
try {
    refreshSftpSessionsList();
} catch {}
