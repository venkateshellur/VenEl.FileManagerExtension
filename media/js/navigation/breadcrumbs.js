/**
 * VenEl File Manager - Breadcrumbs & Address Bar
 * Interactive breadcrumb pills, path bar editing, and folder jump dropdown.
 */
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

    const cloudInfo = parseCloudUrl(currentPath);
    if (cloudInfo) {
        let html = '';
        const session = (typeof cloudActiveSessions !== 'undefined') ? cloudActiveSessions.find(s => s.connectionId === cloudInfo.connectionId) : null;
        const serverLabel = session ? (session.name || `${session.provider.toUpperCase()} Bucket`) : 'Cloud Storage';
        const rootPath = `cloud://${cloudInfo.connectionId}/`;
        const isAtRoot = cloudInfo.remotePath === '/' || !cloudInfo.remotePath;
        const icon = session && session.provider === 'azure' ? '🟦' : '🟧';
        html += '<span class="crumb' + (isAtRoot ? ' current' : '') + '" onclick="event.stopPropagation(); navigateTo(\'' + escapePath(rootPath) + '\')">' +
                `<i>${icon}</i> ` + escapeHtml(serverLabel) + '</span>';

        const parts = cloudInfo.remotePath.split('/').filter(function(p) { return p !== ''; });
        let accum = `cloud://${cloudInfo.connectionId}`;
        for (let i = 0; i < parts.length; i++) {
            accum += '/' + parts[i];
            const isCurrent = (i === parts.length - 1);
            html += '<span class="crumb-sep">›</span>';
            html += '<span class="crumb' + (isCurrent ? ' current' : '') + '" onclick="event.stopPropagation(); navigateTo(\'' + escapePath(accum) + '\')">' +
                    escapeHtml(parts[i]) + '</span>';
        }
        container.innerHTML = html;
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

