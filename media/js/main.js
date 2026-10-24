/**
 * VenEl File Manager - Main Entry Point & Orchestrator
 * Global event listeners, keyboard shortcuts, VS Code message bus, and bootstrap.
 */
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
// 🚀 APPLICATION BOOTSTRAP & INITIALIZATION
// ══════════════════════════════════════════════════════════

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
updateFolderStyleMenu();

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

// Initialize Cloud Storage Sessions & Saved Profiles
try {
    refreshCloudSessionsList();
} catch {}

// Initialize About & Version displays
try {
    updateAboutVersionDisplay();
} catch {}

// Global error logging bridge to central Logger
window.addEventListener('error', function(event) {
    try {
        const payload = {
            command: 'logError',
            text: `[UI Error] ${event.message || 'Unknown UI Error'} (${event.filename || 'app.js'}:${event.lineno || 0})`,
            error: event.error ? (event.error.stack || event.error.message) : event.message
        };
        if (typeof window.vscode !== 'undefined' && window.vscode.postMessage) {
            window.vscode.postMessage(payload);
        } else if (window.parent && window.parent !== window) {
            window.parent.postMessage(payload, '*');
        }
    } catch {}
});

window.addEventListener('unhandledrejection', function(event) {
    try {
        const reason = event.reason;
        const payload = {
            command: 'logError',
            text: `[UI Unhandled Rejection] ${reason?.message || String(reason)}`,
            error: reason?.stack || String(reason)
        };
        if (typeof window.vscode !== 'undefined' && window.vscode.postMessage) {
            window.vscode.postMessage(payload);
        } else if (window.parent && window.parent !== window) {
            window.parent.postMessage(payload, '*');
        }
    } catch {}
});



// ══════════════════════════════════════════════════════════
// 🌟 PUBLIC MICRO-UI INTERFACE (window.VenEl)
// ══════════════════════════════════════════════════════════
window.VenEl = {
    version: "1.3.2",
    state: { safeStorage },
    views: { setView, setFolderStyle, getFolderSvg },
    navigation: { navigateTo, goBack, goForward, goUp, goHome, refreshCurrentFolder },
    commander: { toggleDualPaneMode },
    preview: { togglePreview, toggleQuickLook },
    modals: { openSftpModal, openCloudModal, openAboutModal }
};
