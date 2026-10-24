/**
 * VenEl File Manager - Machine & Folder Search Engine
 * Full machine search, folder filtering, and instant search HUD.
 */
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
