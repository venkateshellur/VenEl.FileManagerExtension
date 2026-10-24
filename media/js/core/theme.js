/**
 * VenEl File Manager - Theme Engine
 * Manages IDE theme detection, dark/light modes, and custom palette switching.
 */
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
            if (event.data.version) {
                extensionVersion = event.data.version;
                updateAboutVersionDisplay();
            }
            if (event.data.engine) {
                backendEngineName = event.data.engine;
                updateAboutVersionDisplay();
            }
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
        if (event.data.command === 'open-issue-modal') {
            openReportIssueModal();
        } else if (event.data.command === 'recent-logs-data') {
            const logsElem = document.getElementById('issue-logs-preview');
            if (logsElem) {
                logsElem.textContent = event.data.logs || 'No recent logs.';
            }
            cachedRecentLogs = event.data.logs || '';
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