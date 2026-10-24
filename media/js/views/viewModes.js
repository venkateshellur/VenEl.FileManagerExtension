/**
 * VenEl File Manager - View Modes
 * Manages Grid, Small Grid, Large, List, Details, and Compact views.
 */
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
