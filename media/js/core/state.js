/**
 * VenEl File Manager - Core State & Utilities
 * Manages application state, safeStorage, and formatting helpers.
 */
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
const isWindowsPlatform = typeof navigator !== 'undefined' && (/Win/i.test(navigator.platform || '') || /Win/i.test(navigator.userAgent || ''));
let isWindows = isWindowsPlatform;
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
let extensionVersion = (function() {
    try {
        const p = new URLSearchParams(window.location.search).get('version');
        if (p) return p;
    } catch {}
    return '1.3.0';
})();
let backendEngineName = 'Kestrel (.NET)';
let activeWorkingDirectory = safeStorage.getItem('venel_working_directory') || null;
let ideWorkspaceFolders = [];
let idePrimaryWorkspace = null;

// Navigation History Stack
let navHistory = [];
let navHistoryIndex = -1;

// Sorting State
let currentSort = { field: 'name', asc: true };
let clipboard = null;

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