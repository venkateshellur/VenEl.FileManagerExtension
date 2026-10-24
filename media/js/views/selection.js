/**
 * VenEl File Manager - Selection, Drag & Drop, and Hover Cards
 * Item selection, multi-select, keyboard navigation, and file hover tooltips.
 */
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
    if (iconEl) {
        if (visual.svg) iconEl.innerHTML = visual.svg;
        else iconEl.textContent = visual.icon;
    }
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