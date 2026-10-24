/**
 * VenEl File Manager - History & Navigation
 * Handles back, forward, up, home, directory navigation, and refresh.
 */
// ══════════════════════════════════════════════════════════
// 🧭 NAVIGATION & HISTORY
// ══════════════════════════════════════════════════════════
function normalizeNavPath(p) {
    if (!p || typeof p !== 'string') return p;
    if (p === '/' || /^[a-zA-Z]:[\\/]?$/.test(p)) return p;
    return p.replace(/[\\/]+$/, '');
}

function navigateTo(targetPath, isHistoryAction = false) {
    closePathDropdown();
    if (isDualPane) {
        loadCommanderPane(activePaneId, targetPath, isHistoryAction);
        return;
    }
    const normTarget = normalizeNavPath(targetPath);
    if (!isHistoryAction && normTarget) {
        // If user branched from previous history index, truncate forward history
        if (navHistoryIndex >= 0 && navHistoryIndex < navHistory.length - 1) {
            navHistory = navHistory.slice(0, navHistoryIndex + 1);
        }
        const last = navHistory.length > 0 ? normalizeNavPath(navHistory[navHistory.length - 1]) : null;
        if (last !== normTarget) {
            navHistory.push(normTarget);
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
    // Skip consecutive duplicates if any
    while (navHistoryIndex > 0 && normalizeNavPath(navHistory[navHistoryIndex - 1]) === normalizeNavPath(currentPath)) {
        navHistoryIndex--;
    }
    if (navHistoryIndex > 0) {
        navHistoryIndex--;
        updateNavButtons();
        const activeTab = tabs.find(function(t) { return t.id === activeTabId; });
        if (activeTab) {
            activeTab.historyIndex = navHistoryIndex;
        }
        loadFiles(navHistory[navHistoryIndex]);
    } else {
        // At start of history: gracefully navigate to parent folder instead of remaining stuck
        goUp();
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
        const activeTab = tabs.find(function(t) { return t.id === activeTabId; });
        if (activeTab) {
            activeTab.historyIndex = navHistoryIndex;
        }
        loadFiles(navHistory[navHistoryIndex]);
    }
}

function canNavigateBack() {
    if (isDualPane) {
        const state = activePaneId === 'left' ? commanderLeftState : commanderRightState;
        return !!(state && state.history && state.historyIndex > 0);
    }
    if (navHistoryIndex > 0) return true;
    if (!currentPath || currentPath === '.' || currentPath === '/' || /^[a-zA-Z]:[\\/]?$/.test(currentPath)) return false;
    return true;
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

    const cloudInfo = parseCloudUrl(currentPath);
    if (cloudInfo) {
        if (cloudInfo.remotePath === '/' || !cloudInfo.remotePath) return;
        const parts = cloudInfo.remotePath.split('/').filter(function(p) { return p !== ''; });
        if (parts.length <= 1) {
            navigateTo(`cloud://${cloudInfo.connectionId}/`);
            return;
        }
        parts.pop();
        navigateTo(`cloud://${cloudInfo.connectionId}/` + parts.join('/'));
        return;
    }

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
