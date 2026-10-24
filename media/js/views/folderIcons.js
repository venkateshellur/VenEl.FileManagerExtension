/**
 * VenEl File Manager - Folder Icons & Visuals
 * Provides native macOS Finder and Windows Fluent SVG folder designs.
 */
// ══════════════════════════════════════════════════════════
// 📂 OS NATIVE FOLDER ICONS (macOS Finder / Windows Fluent)
// ══════════════════════════════════════════════════════════
let currentFolderStyle = safeStorage.getItem('venel_folder_style') || (isWindowsPlatform ? 'windows' : 'mac');

function getMacFolderSvg(folderName) {
    let emblemSvg = '';
    const nameLower = (folderName || '').toLowerCase();
    
    if (nameLower === 'downloads') {
        emblemSvg = '<g opacity="0.85" fill="#ffffff"><path d="M32 38l-7-7h4.5V22h5v9H39z"/><path d="M23 41h18v2H23z"/></g>';
    } else if (nameLower === 'documents' || nameLower === 'docs') {
        emblemSvg = '<g opacity="0.85" fill="#ffffff"><path d="M26 21h8l6 6v14a2 2 0 0 1-2 2H26a2 2 0 0 1-2-2V23a2 2 0 0 1 2-2zm7 1.5V27h4.5L33 22.5z"/><line x1="28" y1="31" x2="36" y2="31" stroke="#ffffff" stroke-width="1.5"/><line x1="28" y1="35" x2="36" y2="35" stroke="#ffffff" stroke-width="1.5"/></g>';
    } else if (nameLower === 'desktop') {
        emblemSvg = '<g opacity="0.85" fill="#ffffff"><rect x="23" y="22" width="18" height="12" rx="1.5" fill="none" stroke="#ffffff" stroke-width="1.5"/><path d="M30 35h4v3h-4z"/><path d="M26 38h12v1.5H26z"/></g>';
    } else if (nameLower === 'pictures' || nameLower === 'images' || nameLower === 'photos') {
        emblemSvg = '<g opacity="0.85" fill="#ffffff"><rect x="23" y="22" width="18" height="14" rx="1.5" fill="none" stroke="#ffffff" stroke-width="1.5"/><circle cx="28" cy="26" r="1.5"/><path d="M24 33l5-5 4 4 3-3 4 4v1H24z"/></g>';
    } else if (nameLower === 'music' || nameLower === 'audio') {
        emblemSvg = '<g opacity="0.85" fill="#ffffff"><path d="M36 21v11.5a3.5 3.5 0 1 1-2.5-3.3V24.5l-8 2.2V35a3.5 3.5 0 1 1-2.5-3.3V24a1.5 1.5 0 0 1 1.2-1.5l10.5-2.8A1.5 1.5 0 0 1 36 21z"/></g>';
    } else if (nameLower === 'movies' || nameLower === 'videos' || nameLower === 'video') {
        emblemSvg = '<g opacity="0.85" fill="#ffffff"><rect x="22" y="23" width="20" height="14" rx="1.5" fill="none" stroke="#ffffff" stroke-width="1.5"/><polygon points="29,26 36,30 29,34"/></g>';
    } else if (nameLower === 'src' || nameLower === 'code' || nameLower === 'scripts') {
        emblemSvg = '<g opacity="0.9" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M27 27l-4 4 4 4"/><path d="M37 27l4 4-4 4"/><path d="M33 25l-2 12"/></g>';
    } else if (nameLower === '.git' || nameLower === 'git') {
        emblemSvg = '<g opacity="0.85" fill="#ffffff"><circle cx="27" cy="26" r="2.2"/><circle cx="37" cy="28" r="2.2"/><circle cx="27" cy="36" r="2.2"/><path d="M27 28.2v5.6" stroke="#ffffff" stroke-width="1.8"/><path d="M27 30c3 0 7-1 10-2" fill="none" stroke="#ffffff" stroke-width="1.8"/></g>';
    } else {
        emblemSvg = '<rect x="22" y="30" width="20" height="2" rx="1" fill="rgba(255,255,255,0.25)"/><rect x="22" y="31" width="20" height="1" rx="0.5" fill="rgba(0,35,80,0.22)"/>';
    }

    return '<svg class="os-folder-icon mac-folder" viewBox="0 0 64 54" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M 6 10 C 6 7 8 5 11 5 L 24 5 C 27.5 5 29.8 7.2 32.5 10 L 34.5 12 L 53 12 C 56.5 12 59 14.5 59 18 L 59 45 C 59 48.5 56.5 51 53 51 L 11 51 C 7.5 51 5 48.5 5 45 L 5 12 C 5 10.9 5.4 10 6 10 Z" fill="url(#macTabGrad)"/>' +
        '<path d="M 6 16 L 58 16 L 58 24 L 6 24 Z" fill="#043a7a" opacity="0.55"/>' +
        '<g filter="url(#macFolderDrop)">' +
            '<path d="M 4 16.5 C 4 13.5 6.5 11 9.5 11 L 54.5 11 C 57.5 11 60 13.5 60 16.5 L 60 45 C 60 48.2 57.5 51 54.5 51 L 9.5 51 C 6.5 51 4 48.2 4 45 Z" fill="url(#macBodyGrad)"/>' +
            '<path d="M 8 11.8 L 56 11.8" stroke="url(#macSpecular)" stroke-width="1.2" stroke-linecap="round"/>' +
            emblemSvg +
        '</g>' +
    '</svg>';
}

function getWinFolderSvg(folderName) {
    let emblemSvg = '';
    const nameLower = (folderName || '').toLowerCase();
    
    if (nameLower === 'downloads') {
        emblemSvg = '<g opacity="0.85" fill="#2d3748"><path d="M32 38l-6-6h4V22h4v10h4z"/><path d="M24 41h16v1.8H24z"/></g>';
    } else if (nameLower === 'documents' || nameLower === 'docs') {
        emblemSvg = '<g opacity="0.85" fill="#2d3748"><path d="M26 21h8l6 6v14a2 2 0 0 1-2 2H26a2 2 0 0 1-2-2V23a2 2 0 0 1 2-2zm7 1.5V27h4.5L33 22.5z"/></g>';
    } else if (nameLower === 'desktop') {
        emblemSvg = '<g opacity="0.85" fill="#2d3748"><rect x="23" y="22" width="18" height="12" rx="1.5" fill="none" stroke="#2d3748" stroke-width="1.5"/><path d="M30 35h4v3h-4z"/><path d="M26 38h12v1.5H26z"/></g>';
    } else if (nameLower === 'pictures' || nameLower === 'images' || nameLower === 'photos') {
        emblemSvg = '<g opacity="0.85" fill="#2d3748"><rect x="23" y="22" width="18" height="14" rx="1.5" fill="none" stroke="#2d3748" stroke-width="1.5"/><circle cx="28" cy="26" r="1.5"/><path d="M24 33l5-5 4 4 3-3 4 4v1H24z"/></g>';
    } else if (nameLower === 'music' || nameLower === 'audio') {
        emblemSvg = '<g opacity="0.85" fill="#2d3748"><path d="M36 21v11.5a3.5 3.5 0 1 1-2.5-3.3V24.5l-8 2.2V35a3.5 3.5 0 1 1-2.5-3.3V24a1.5 1.5 0 0 1 1.2-1.5l10.5-2.8A1.5 1.5 0 0 1 36 21z"/></g>';
    } else if (nameLower === 'movies' || nameLower === 'videos' || nameLower === 'video') {
        emblemSvg = '<g opacity="0.85" fill="#2d3748"><rect x="22" y="23" width="20" height="14" rx="1.5" fill="none" stroke="#2d3748" stroke-width="1.5"/><polygon points="29,26 36,30 29,34"/></g>';
    } else if (nameLower === 'src' || nameLower === 'code' || nameLower === 'scripts') {
        emblemSvg = '<g opacity="0.9" fill="none" stroke="#2d3748" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M27 27l-4 4 4 4"/><path d="M37 27l4 4-4 4"/><path d="M33 25l-2 12"/></g>';
    } else if (nameLower === '.git' || nameLower === 'git') {
        emblemSvg = '<g opacity="0.85" fill="#2d3748"><circle cx="27" cy="26" r="2.2"/><circle cx="37" cy="28" r="2.2"/><circle cx="27" cy="36" r="2.2"/><path d="M27 28.2v5.6" stroke="#2d3748" stroke-width="1.8"/><path d="M27 30c3 0 7-1 10-2" fill="none" stroke="#2d3748" stroke-width="1.8"/></g>';
    }

    return '<svg class="os-folder-icon win-folder" viewBox="0 0 64 54" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M 6 12 C 6 9.5 8 7.5 10.5 7.5 L 25 7.5 C 27.5 7.5 29.5 9 31.5 11.5 L 34 14.5 L 54 14.5 C 57 14.5 59 16.5 59 19.5 L 59 45 C 59 48 57 50 54 50 L 10 50 C 7 50 5 48 5 45 L 5 14 C 5 12.8 5.4 12 6 12 Z" fill="url(#winTabGrad)"/>' +
        '<path d="M 12 11 L 38 11 L 46 19 L 46 28 L 12 28 Z" fill="url(#winDocGrad)"/>' +
        '<path d="M 38 11 L 38 19 L 46 19 Z" fill="#cbd5e1"/>' +
        '<g filter="url(#winFolderDrop)">' +
            '<path d="M 4 18 C 4 15.2 6.2 13 9 13 L 55 13 C 57.8 13 60 15.2 60 18 L 60 45 C 60 48 57.8 50.5 55 50.5 L 9 50.5 C 6.2 50.5 4 48 4 45 Z" fill="url(#winBodyGrad)"/>' +
            '<path d="M 8 13.8 L 56 13.8" stroke="rgba(255,255,255,0.75)" stroke-width="1.2" stroke-linecap="round"/>' +
            emblemSvg +
        '</g>' +
    '</svg>';
}

function getFolderSvg(folderName) {
    if (currentFolderStyle === 'windows') {
        return getWinFolderSvg(folderName);
    }
    return getMacFolderSvg(folderName);
}

function updateFolderStyleMenu() {
    const macOpt = document.getElementById('opt-folder-mac');
    const winOpt = document.getElementById('opt-folder-win');
    if (macOpt) macOpt.classList.toggle('active', currentFolderStyle === 'mac');
    if (winOpt) winOpt.classList.toggle('active', currentFolderStyle === 'windows');
}

function setFolderStyle(style) {
    currentFolderStyle = style === 'windows' ? 'windows' : 'mac';
    safeStorage.setItem('venel_folder_style', currentFolderStyle);
    updateFolderStyleMenu();
    closeViewMenu();
    if (displayedItems && displayedItems.length > 0) {
        renderItems(displayedItems);
    }
}

// ══════════════════════════════════════════════════════════
// 🎨 VISUAL FILE TYPES & BADGES
// ══════════════════════════════════════════════════════════
function getFileVisual(name, isDir) {
    if (isDir) {
        return { 
            icon: '📁', 
            svg: getFolderSvg(name),
            badge: '', 
            color: '#74b9ff', 
            isImage: false, 
            isDir: true, 
            typeLabel: 'File folder' 
        };
    }
    const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
    switch(ext) {
        case 'cs': return { icon: '🔷', badge: 'C#', color: '#68217a', isImage: false, typeLabel: 'C# Source File' };
        case 'ts': return { icon: '🟦', badge: 'TS', color: '#3178c6', isImage: false, typeLabel: 'TypeScript File' };
        case 'js': return { icon: '🟨', badge: 'JS', color: '#f7df1e', isImage: false, typeLabel: 'JavaScript File' };
        case 'py': return { icon: '🐍', badge: 'PY', color: '#3776ab', isImage: false, typeLabel: 'Python Script' };
        case 'json': return { icon: '🟧', badge: '{}', color: '#e67e22', isImage: false, typeLabel: 'JSON File' };
        case 'html': return { icon: '🌐', badge: '<>', color: '#e44d26', isImage: false, typeLabel: 'HTML Document' };
        case 'css': return { icon: '🎨', badge: '#', color: '#264de4', isImage: false, typeLabel: 'CSS Stylesheet' };
        case 'md': return { icon: '📝', badge: 'MD', color: '#4a90e2', isImage: false, typeLabel: 'Markdown Document' };
        case 'sql': return { icon: '🗄️', badge: 'SQL', color: '#00cec9', isImage: false, typeLabel: 'SQL Query File' };
        case 'sh': case 'bash': case 'zsh': return { icon: '⚡', badge: 'SH', color: '#2ecc71', isImage: false, typeLabel: 'Shell Script' };
        case 'xml': case 'yaml': case 'yml': return { icon: '⚙️', badge: 'CFG', color: '#9b59b6', isImage: false, typeLabel: 'Configuration File' };
        case 'png': case 'jpg': case 'jpeg': case 'gif': case 'webp': case 'svg': case 'ico':
            return { icon: '🖼️', badge: ext.toUpperCase(), color: '#e056fd', isImage: true, typeLabel: ext.toUpperCase() + ' Image' };
        case 'mp4': case 'mov': case 'mkv': case 'webm':
            return { icon: '🎬', badge: 'VID', color: '#eb4d4b', isImage: false, typeLabel: 'Video File' };
        case 'mp3': case 'wav': case 'flac': case 'm4a':
            return { icon: '🎵', badge: 'AUD', color: '#00cec9', isImage: false, typeLabel: 'Audio File' };
        case 'zip': case 'tar': case 'gz': case 'rar': case '7z':
            return { icon: '📦', badge: 'ZIP', color: '#f0932b', isImage: false, typeLabel: 'Compressed Archive' };
        case 'pdf': return { icon: '📕', badge: 'PDF', color: '#e74c3c', isImage: false, typeLabel: 'PDF Document' };
        case 'txt': case 'log': return { icon: '📄', badge: 'TXT', color: '#95a5a6', isImage: false, typeLabel: 'Text Document' };
        case 'doc': case 'docx': return { icon: '📘', badge: 'DOC', color: '#2980b9', isImage: false, typeLabel: 'Word Document' };
        case 'xls': case 'xlsx': case 'csv': return { icon: '📊', badge: 'XLS', color: '#27ae60', isImage: false, typeLabel: 'Spreadsheet' };
        default: return { icon: '📄', badge: ext ? ext.slice(0, 3).toUpperCase() : '', color: '#888899', isImage: false, typeLabel: (ext ? ext.toUpperCase() + ' File' : 'File') };
    }
}
