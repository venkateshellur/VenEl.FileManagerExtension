/**
 * VenEl File Manager - Cloud Storage Manager
 * AWS S3, MinIO, Azure Blob, Google Cloud Storage connect and test dialogs.
 */
// ☁️ CLOUD STORAGE MANAGER (AWS S3, MinIO, Azure Blob)
// ══════════════════════════════════════════════════════════

function loadCloudSavedProfiles() {
    try {
        const raw = safeStorage.getItem('venel_cloud_profiles');
        cloudSavedProfiles = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(cloudSavedProfiles)) cloudSavedProfiles = [];
    } catch {
        cloudSavedProfiles = [];
    }
}

function saveCloudProfilesToStorage() {
    try {
        safeStorage.setItem('venel_cloud_profiles', JSON.stringify(cloudSavedProfiles));
    } catch {}
}

async function refreshCloudSessionsList() {
    loadCloudSavedProfiles();
    try {
        const res = await fetch('/api/cloud/sessions').catch(() => null);
        if (res && res.ok) {
            cloudActiveSessions = await res.json();
            if (!Array.isArray(cloudActiveSessions)) cloudActiveSessions = [];
        } else {
            cloudActiveSessions = [];
        }
    } catch {
        cloudActiveSessions = [];
    }

    renderCloudSidebar();
}

function renderCloudSidebar() {
    const listEl = document.getElementById('cloud-connections-list');
    const badgeEl = document.getElementById('cloud-active-count-badge');
    if (!listEl) return;

    if (badgeEl) {
        const count = cloudActiveSessions.length;
        badgeEl.textContent = count;
        badgeEl.style.display = count > 0 ? 'inline-block' : 'none';
    }

    let html = '';

    // 1. Active Connected Cloud Sessions
    if (cloudActiveSessions.length > 0) {
        cloudActiveSessions.forEach(session => {
            const isCurrent = currentPath.startsWith('cloud://' + session.connectionId);
            const targetUrl = `cloud://${session.connectionId}/`;
            const provBadgeClass = session.provider === 'azure_blob' ? 'cloud-badge-azure' : ((session.endpoint && session.endpoint.includes('minio')) ? 'cloud-badge-minio' : 'cloud-badge-s3');
            const provLabel = session.provider === 'azure_blob' ? 'Azure' : ((session.endpoint && session.endpoint.includes('minio')) ? 'MinIO' : 'S3');

            html += `<div class="sftp-conn-item active ${isCurrent ? 'selected' : ''}" onclick="navigateTo('${escapePath(targetUrl)}')">` +
                '<div class="sftp-conn-info">' +
                    '<div class="sftp-conn-title-row">' +
                        '<span class="sftp-conn-dot" title="Active Cloud Session"></span>' +
                        `<span class="sftp-conn-name" title="${escapeHtml(session.name || session.bucketOrContainer)}">${escapeHtml(session.name || session.bucketOrContainer)}</span>` +
                        `<span class="cloud-provider-badge ${provBadgeClass}">${provLabel}</span>` +
                    '</div>' +
                    `<div class="sftp-conn-sub">${escapeHtml(session.bucketOrContainer || session.endpoint || 'Root')}</div>` +
                '</div>' +
                '<div class="sftp-conn-actions">' +
                    `<button class="sftp-icon-btn danger" onclick="disconnectCloudSession('${session.connectionId}', event)" title="Disconnect Cloud Storage">⏏️</button>` +
                '</div>' +
            '</div>';
        });
    }

    // 2. Saved Connection Profiles (not currently connected)
    const activeIds = new Set(cloudActiveSessions.map(s => s.connectionId));
    const inactiveProfiles = cloudSavedProfiles.filter(p => !activeIds.has(p.id));

    if (inactiveProfiles.length > 0) {
        inactiveProfiles.forEach(prof => {
            const provBadgeClass = prof.provider === 'azure_blob' ? 'cloud-badge-azure' : ((prof.endpoint && prof.endpoint.includes('minio')) ? 'cloud-badge-minio' : 'cloud-badge-s3');
            const provLabel = prof.provider === 'azure_blob' ? 'Azure' : ((prof.endpoint && prof.endpoint.includes('minio')) ? 'MinIO' : 'S3');

            html += `<div class="sftp-conn-item" onclick="connectSavedCloudProfile('${prof.id}')" title="Click to Connect">` +
                '<div class="sftp-conn-info">' +
                    '<div class="sftp-conn-title-row">' +
                        '<span style="font-size: 13px;">⚡</span>' +
                        `<span class="sftp-conn-name" title="${escapeHtml(prof.name || prof.bucketName)}">${escapeHtml(prof.name || prof.bucketName)}</span>` +
                        `<span class="cloud-provider-badge ${provBadgeClass}">${provLabel}</span>` +
                    '</div>' +
                    `<div class="sftp-conn-sub">${escapeHtml(prof.bucketName || prof.endpoint || 'Cloud')}</div>` +
                '</div>' +
                '<div class="sftp-conn-actions">' +
                    `<button class="sftp-icon-btn" onclick="openCloudModal(getSavedCloudProfileById('${prof.id}'), event)" title="Edit Profile">✏️</button>` +
                    `<button class="sftp-icon-btn danger" onclick="deleteSavedCloudProfile('${prof.id}', event)" title="Delete Profile">✕</button>` +
                '</div>' +
            '</div>';
        });
    }

    if (cloudActiveSessions.length === 0 && cloudSavedProfiles.length === 0) {
        html = '<div style="padding: 10px 8px; font-size: 11px; color: var(--text-muted); text-align: center; line-height: 1.4;">' +
            'No cloud storage connected.<br><button class="sftp-browse-btn" onclick="openCloudModal()" style="margin-top: 6px;">+ Connect to Cloud</button>' +
        '</div>';
    }

    listEl.innerHTML = html;
}

function getSavedCloudProfileById(id) {
    return cloudSavedProfiles.find(p => p.id === id);
}

function openCloudModal(profileToEdit = null, event = null, initialProvider = 's3') {
    if (profileToEdit && (profileToEdit instanceof Event || profileToEdit.target)) {
        event = profileToEdit;
        profileToEdit = null;
    }
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }

    const modal = document.getElementById('modal-cloud');
    if (!modal) return;

    const alertEl = document.getElementById('cloud-status-alert');
    if (alertEl) alertEl.style.display = 'none';

    const titleEl = document.getElementById('cloud-modal-title');
    const s3Name = document.getElementById('cloud-s3-input-name');
    const s3Bucket = document.getElementById('cloud-s3-input-bucket');
    const s3Region = document.getElementById('cloud-s3-input-region');
    const s3Endpoint = document.getElementById('cloud-s3-input-endpoint');
    const s3AccessKey = document.getElementById('cloud-s3-input-access-key');
    const s3SecretKey = document.getElementById('cloud-s3-input-secret-key');
    const s3Prefix = document.getElementById('cloud-s3-input-prefix');
    const s3PathStyle = document.getElementById('cloud-s3-chk-path-style');

    const azName = document.getElementById('cloud-azure-input-name');
    const azConnStr = document.getElementById('cloud-azure-input-connection-string');
    const azContainer = document.getElementById('cloud-azure-input-container');
    const azPrefix = document.getElementById('cloud-azure-input-prefix');

    const saveChk = document.getElementById('cloud-chk-save-profile');
    const rememberChk = document.getElementById('cloud-chk-remember-creds');

    if (profileToEdit) {
        modal.setAttribute('data-edit-id', profileToEdit.id);
        if (titleEl) titleEl.textContent = 'Edit Cloud Connection';
        const prov = (profileToEdit.provider === 'azure_blob' || profileToEdit.provider === 'azure') ? 'azure' : 's3';
        switchCloudProvider(prov);

        if (prov === 's3') {
            if (s3Name) s3Name.value = profileToEdit.name || '';
            if (s3Bucket) s3Bucket.value = profileToEdit.bucketName || '';
            if (s3Region) s3Region.value = profileToEdit.region || 'us-east-1';
            if (s3Endpoint) s3Endpoint.value = profileToEdit.endpoint || '';
            if (s3AccessKey) s3AccessKey.value = profileToEdit.accessKey || '';
            if (s3SecretKey) s3SecretKey.value = profileToEdit.secretKey || '';
            if (s3Prefix) s3Prefix.value = profileToEdit.initialPrefix || '';
            if (s3PathStyle) s3PathStyle.checked = Boolean(profileToEdit.forcePathStyle);
        } else {
            if (azName) azName.value = profileToEdit.name || '';
            if (azConnStr) azConnStr.value = profileToEdit.connectionString || '';
            if (azContainer) azContainer.value = profileToEdit.bucketName || '';
            if (azPrefix) azPrefix.value = profileToEdit.initialPrefix || '';
        }

        if (saveChk) saveChk.checked = true;
        if (rememberChk) rememberChk.checked = Boolean(profileToEdit.accessKey || profileToEdit.secretKey || profileToEdit.connectionString);
    } else {
        modal.removeAttribute('data-edit-id');
        if (titleEl) titleEl.textContent = 'Connect to Cloud Storage';
        switchCloudProvider(initialProvider || 's3');

        if (s3Name) s3Name.value = '';
        if (s3Bucket) s3Bucket.value = '';
        if (s3Region) s3Region.value = 'us-east-1';
        if (s3Endpoint) s3Endpoint.value = '';
        if (s3AccessKey) s3AccessKey.value = '';
        if (s3SecretKey) s3SecretKey.value = '';
        if (s3Prefix) s3Prefix.value = '';
        if (s3PathStyle) s3PathStyle.checked = false;

        if (azName) azName.value = '';
        if (azConnStr) azConnStr.value = '';
        if (azContainer) azContainer.value = '';
        if (azPrefix) azPrefix.value = '';

        if (saveChk) saveChk.checked = true;
        if (rememberChk) rememberChk.checked = true;
    }

    modal.style.display = 'flex';
    setTimeout(() => {
        if (currentCloudProvider === 's3' && s3Bucket && !s3Bucket.value) s3Bucket.focus();
        else if (currentCloudProvider === 'azure' && azConnStr && !azConnStr.value) azConnStr.focus();
    }, 50);
}

function closeCloudModal(e = null) {
    if (e && e.target && e.target.id !== 'modal-cloud' && !e.target.classList.contains('modal-close-x') && !e.target.closest('.modal-close-x') && !e.target.classList.contains('cancel') && !e.target.closest('.cancel')) {
        return;
    }
    const modal = document.getElementById('modal-cloud');
    if (modal) modal.style.display = 'none';
}

function switchCloudProvider(provider) {
    currentCloudProvider = (provider === 'azure' || provider === 'azure_blob') ? 'azure' : 's3';
    const tabS3 = document.getElementById('btn-cloud-tab-s3');
    const tabAzure = document.getElementById('btn-cloud-tab-azure');
    const panelS3 = document.getElementById('cloud-provider-panel-s3');
    const panelAzure = document.getElementById('cloud-provider-panel-azure');

    if (tabS3) tabS3.classList.toggle('active', currentCloudProvider === 's3');
    if (tabAzure) tabAzure.classList.toggle('active', currentCloudProvider === 'azure');

    if (panelS3) panelS3.style.display = currentCloudProvider === 's3' ? 'flex' : 'none';
    if (panelAzure) panelAzure.style.display = currentCloudProvider === 'azure' ? 'flex' : 'none';
}

function applyS3Preset(preset) {
    const endpointInput = document.getElementById('cloud-s3-input-endpoint');
    const regionInput = document.getElementById('cloud-s3-input-region');
    const pathStyleChk = document.getElementById('cloud-s3-chk-path-style');

    if (preset === 'minio') {
        if (endpointInput) endpointInput.value = 'http://localhost:9000';
        if (regionInput) regionInput.value = 'us-east-1';
        if (pathStyleChk) pathStyleChk.checked = true;
        showToast('Configured MinIO local defaults (Endpoint: :9000, Path-Style on) 🦩', 'ℹ️');
    } else if (preset === 'r2') {
        if (endpointInput) endpointInput.value = 'https://<account-id>.r2.cloudflarestorage.com';
        if (regionInput) regionInput.value = 'auto';
        if (pathStyleChk) pathStyleChk.checked = false;
        showToast('Configured Cloudflare R2 preset ⚡', 'ℹ️');
    } else if (preset === 'custom') {
        if (pathStyleChk) pathStyleChk.checked = true;
        showToast('Configured custom S3 endpoint preset ⚙️', 'ℹ️');
    } else { // aws
        if (endpointInput) endpointInput.value = '';
        if (regionInput) regionInput.value = 'us-east-1';
        if (pathStyleChk) pathStyleChk.checked = false;
        showToast('Configured AWS S3 defaults (Standard Global Endpoint) ☁️', 'ℹ️');
    }
}

function toggleCloudPasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
}

function handleCloudSaveCheckboxChange() {
    const saveChk = document.getElementById('cloud-chk-save-profile');
    const remLabel = document.getElementById('cloud-lbl-remember-creds');
    if (remLabel && saveChk) {
        remLabel.style.display = saveChk.checked ? 'flex' : 'none';
    }
}

function getCloudFormData() {
    if (currentCloudProvider === 's3') {
        const name = (document.getElementById('cloud-s3-input-name')?.value || '').trim();
        const bucketName = (document.getElementById('cloud-s3-input-bucket')?.value || '').trim();
        const region = (document.getElementById('cloud-s3-input-region')?.value || 'us-east-1').trim();
        const endpoint = (document.getElementById('cloud-s3-input-endpoint')?.value || '').trim();
        const accessKey = (document.getElementById('cloud-s3-input-access-key')?.value || '').trim();
        const secretKey = (document.getElementById('cloud-s3-input-secret-key')?.value || '').trim();
        const initialPrefix = (document.getElementById('cloud-s3-input-prefix')?.value || '').trim();
        const forcePathStyle = document.getElementById('cloud-s3-chk-path-style')?.checked || false;

        return {
            provider: 's3',
            name: name || bucketName,
            bucketName,
            region: region || 'us-east-1',
            endpoint: endpoint || null,
            accessKey: accessKey || null,
            secretKey: secretKey || null,
            initialPrefix: initialPrefix || null,
            forcePathStyle
        };
    } else {
        const name = (document.getElementById('cloud-azure-input-name')?.value || '').trim();
        const connectionString = (document.getElementById('cloud-azure-input-connection-string')?.value || '').trim();
        const container = (document.getElementById('cloud-azure-input-container')?.value || '').trim();
        const initialPrefix = (document.getElementById('cloud-azure-input-prefix')?.value || '').trim();

        return {
            provider: 'azure_blob',
            name: name || container || 'Azure Blob',
            connectionString,
            bucketName: container || null,
            initialPrefix: initialPrefix || null
        };
    }
}

function showCloudAlert(message, type = 'info') {
    const alertEl = document.getElementById('cloud-status-alert');
    if (!alertEl) return;
    alertEl.className = 'sftp-alert-' + type;
    alertEl.textContent = message;
    alertEl.style.display = 'block';
}

async function testCloudConnection() {
    const data = getCloudFormData();
    if (data.provider === 's3') {
        if (!data.bucketName) {
            showCloudAlert('Please enter an S3 / MinIO bucket name.', 'error');
            return;
        }
        if (!data.accessKey || !data.secretKey) {
            showCloudAlert('Please enter Access Key ID and Secret Access Key.', 'error');
            return;
        }
    } else {
        if (!data.connectionString) {
            showCloudAlert('Please enter Azure Blob Connection String or SAS URL.', 'error');
            return;
        }
    }

    const testBtn = document.getElementById('btn-cloud-test');
    const spinner = document.getElementById('cloud-test-btn-spinner');
    const btnText = document.getElementById('cloud-test-btn-text');

    if (testBtn) testBtn.disabled = true;
    if (spinner) spinner.style.display = 'inline-block';
    if (btnText) btnText.textContent = 'Testing...';
    showCloudAlert('Testing cloud connection...', 'info');

    try {
        const res = await fetch('/api/cloud/test', {
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
            const countMsg = (result.itemCount != null) ? ` (${result.itemCount} items found)` : '';
            showCloudAlert(`✅ Connected successfully!${countMsg} Latency: ${result.latencyMs || 0}ms`, 'success');
        } else {
            showCloudAlert(`❌ Connection test failed: ${result.errorMessage || 'Check credentials and bucket.'}`, 'error');
        }
    } catch (err) {
        showCloudAlert(`❌ Connection test error: ${err.message}`, 'error');
    } finally {
        if (testBtn) testBtn.disabled = false;
        if (spinner) spinner.style.display = 'none';
        if (btnText) btnText.textContent = '⚡ Test Connection';
    }
}

async function submitCloudConnect() {
    const data = getCloudFormData();
    if (data.provider === 's3') {
        if (!data.bucketName) {
            showCloudAlert('Please enter an S3 / MinIO bucket name.', 'error');
            return;
        }
        if (!data.accessKey || !data.secretKey) {
            showCloudAlert('Please enter Access Key ID and Secret Access Key.', 'error');
            return;
        }
    } else {
        if (!data.connectionString) {
            showCloudAlert('Please enter Azure Blob Connection String or SAS URL.', 'error');
            return;
        }
    }

    const connectBtn = document.getElementById('btn-cloud-connect');
    const spinner = document.getElementById('cloud-connect-btn-spinner');
    const btnText = document.getElementById('cloud-connect-btn-text');

    if (connectBtn) connectBtn.disabled = true;
    if (spinner) spinner.style.display = 'inline-block';
    if (btnText) btnText.textContent = 'Connecting...';
    showCloudAlert('Connecting to Cloud Storage...', 'info');

    try {
        const res = await fetch('/api/cloud/connect', {
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
            showCloudAlert(`❌ Connect failed: ${result.errorMessage || 'Unable to connect to cloud storage.'}`, 'error');
            return;
        }

        // Save connection profile if requested
        const saveChk = document.getElementById('cloud-chk-save-profile');
        const rememberChk = document.getElementById('cloud-chk-remember-creds');
        const modal = document.getElementById('modal-cloud');
        const editId = modal ? modal.getAttribute('data-edit-id') : null;

        if (saveChk && saveChk.checked) {
            const shouldRemember = rememberChk && rememberChk.checked;
            const profile = {
                id: editId || `cloud_prof_${Date.now()}`,
                name: data.name || data.bucketName,
                provider: data.provider,
                bucketName: data.bucketName,
                region: data.region,
                endpoint: data.endpoint,
                accessKey: shouldRemember ? data.accessKey : null,
                secretKey: shouldRemember ? data.secretKey : null,
                connectionString: shouldRemember ? data.connectionString : null,
                forcePathStyle: data.forcePathStyle,
                initialPrefix: data.initialPrefix
            };

            const existingIdx = cloudSavedProfiles.findIndex(p => p.id === profile.id);
            if (existingIdx >= 0) {
                cloudSavedProfiles[existingIdx] = profile;
            } else {
                cloudSavedProfiles.push(profile);
            }
            saveCloudProfilesToStorage();
        }

        closeCloudModal();
        await refreshCloudSessionsList();

        // Navigate to the cloud directory
        const cloudPath = `cloud://${result.connectionId}${result.currentPath || '/'}`;
        navigateTo(cloudPath);
        showToast(`Connected to ${result.name || data.bucketName} ☁️`, '✅');
    } catch (err) {
        showCloudAlert(`❌ Connect error: ${err.message}`, 'error');
    } finally {
        if (connectBtn) connectBtn.disabled = false;
        if (spinner) spinner.style.display = 'none';
        if (btnText) btnText.textContent = 'Connect';
    }
}

async function connectSavedCloudProfile(profileId) {
    const prof = getSavedCloudProfileById(profileId);
    if (!prof) return;

    const hasCreds = (prof.provider === 's3' && prof.accessKey && prof.secretKey) ||
                     (prof.provider === 'azure_blob' && prof.connectionString);

    if (hasCreds) {
        showToast(`Connecting to ${prof.name}... ⏳`, '☁️');
        try {
            const res = await fetch('/api/cloud/connect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider: prof.provider,
                    name: prof.name,
                    bucketName: prof.bucketName,
                    region: prof.region,
                    endpoint: prof.endpoint,
                    accessKey: prof.accessKey,
                    secretKey: prof.secretKey,
                    connectionString: prof.connectionString,
                    forcePathStyle: prof.forcePathStyle,
                    initialPrefix: prof.initialPrefix
                })
            });
            let result = {};
            try {
                result = await res.json();
            } catch {
                result = { success: false, errorMessage: `Server returned HTTP ${res.status}` };
            }
            if (result.success) {
                await refreshCloudSessionsList();
                const cloudPath = `cloud://${result.connectionId}${result.currentPath || '/'}`;
                navigateTo(cloudPath);
                showToast(`Connected to ${prof.name} ☁️`, '✅');
                return;
            } else {
                showToast(`Connect failed: ${result.errorMessage || 'Cloud storage unavailable'}`, '⚠️');
            }
        } catch (err) {
            showToast(`Connection failed: ${err.message}`, '❌');
        }
    }

    openCloudModal(prof);
}

async function disconnectCloudSession(connectionId, e) {
    if (e) {
        e.stopPropagation();
        e.preventDefault();
    }
    try {
        await fetch('/api/cloud/disconnect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ connectionId })
        });
        showToast('Cloud storage session disconnected ⏏️', 'ℹ️');
        await refreshCloudSessionsList();

        if (currentPath.startsWith('cloud://' + connectionId)) {
            goHome();
        }
    } catch (err) {
        console.error(err);
    }
}

function deleteSavedCloudProfile(profileId, e) {
    if (e) {
        e.stopPropagation();
        e.preventDefault();
    }
    cloudSavedProfiles = cloudSavedProfiles.filter(p => p.id !== profileId);
    saveCloudProfilesToStorage();
    renderCloudSidebar();
    showToast('Saved cloud connection removed', '🗑️');
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