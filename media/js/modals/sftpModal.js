/**
 * VenEl File Manager - SFTP Remote Manager
 * SFTP / SSH connection dialog, saved credentials, and test connection.
 */
// 🌐 SFTP REMOTE MANAGER (Sessions, Quick Connect, Saved Profiles)
// ══════════════════════════════════════════════════════════

let sftpActiveSessions = [];
let sftpSavedProfiles = [];
let sftpCurrentAuthMode = 'password';

let cloudActiveSessions = [];
let cloudSavedProfiles = [];
let currentCloudProvider = 's3';

function parseCloudUrl(url) {
    if (!url || typeof url !== 'string' || !url.startsWith('cloud://')) return null;
    const withoutPrefix = url.substring(8);
    const slashIdx = withoutPrefix.indexOf('/');
    if (slashIdx === -1) {
        return { connectionId: withoutPrefix, remotePath: '/' };
    }
    return {
        connectionId: withoutPrefix.substring(0, slashIdx),
        remotePath: withoutPrefix.substring(slashIdx) || '/'
    };
}

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

    // If running in Safe Mode (Node.js) or SFTP capability is unavailable, display friendly guidance modal
    const isSafeMode = (backendEngineName && backendEngineName.includes('Node')) || 
                       (window.currentEngineCapabilities && window.currentEngineCapabilities.sftp === false);
    if (isSafeMode) {
        openSftpSafeModeModal();
        return;
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
    const isSafeMode = (backendEngineName && backendEngineName.includes('Node')) || 
                       (window.currentEngineCapabilities && window.currentEngineCapabilities.sftp === false);
    if (isSafeMode) {
        openSftpSafeModeModal();
        return;
    }

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

// ══════════════════════════════════════════════════════════