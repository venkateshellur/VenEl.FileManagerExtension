import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ServerManager } from './serverManager';
import { LocalServer } from './localServer';
import { Logger } from './logger';

export class FileManagerPanel {
    public static currentPanel: FileManagerPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    public static async createOrShow(extensionUri: vscode.Uri): Promise<FileManagerPanel> {
        // 1. Single Instance: If panel already exists, bring user to the existing instance!
        if (FileManagerPanel.currentPanel) {
            FileManagerPanel.currentPanel._panel.reveal(FileManagerPanel.currentPanel._panel.viewColumn);
            return FileManagerPanel.currentPanel;
        }

        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        const panel = vscode.window.createWebviewPanel(
            'venelFileManager',
            'VenEl File Manager',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri]
            }
        );

        FileManagerPanel.currentPanel = new FileManagerPanel(panel, extensionUri);
        return FileManagerPanel.currentPanel;
    }

    public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        if (FileManagerPanel.currentPanel) {
            panel.dispose();
            return;
        }
        FileManagerPanel.currentPanel = new FileManagerPanel(panel, extensionUri);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        this._panel.iconPath = {
            light: vscode.Uri.joinPath(this._extensionUri, 'media', 'logo.png'),
            dark: vscode.Uri.joinPath(this._extensionUri, 'media', 'logo.png')
        };

        this.refresh();

        vscode.window.onDidChangeActiveColorTheme(() => {
            this.sendThemeUpdate();
        }, null, this._disposables);

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                if (message.command === 'retry') {
                    await this.refresh();
                } else if (message.command === 'openFile' || message.command === 'openInEditor') {
                    if (message.path) {
                        try {
                            await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(message.path));
                        } catch (e: any) {
                            try {
                                const doc = await vscode.workspace.openTextDocument(message.path);
                                await vscode.window.showTextDocument(doc, { preview: false });
                            } catch (err: any) {
                                vscode.window.showErrorMessage(`Could not open file in editor: ${err.message}`);
                            }
                        }
                    }
                } else if (message.command === 'openWithSystemApp') {
                    if (message.path && fs.existsSync(message.path)) {
                        try {
                            const success = await vscode.env.openExternal(vscode.Uri.file(message.path));
                            if (!success) {
                                vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(message.path));
                            }
                        } catch (e: any) {
                            vscode.window.showErrorMessage(`Could not open with system app: ${e.message}`);
                        }
                    }
                } else if (message.command === 'runInTerminal') {
                    if (message.path && fs.existsSync(message.path)) {
                        const filePath = message.path;
                        const dir = path.dirname(filePath);
                        const fileName = path.basename(filePath);
                        const term = vscode.window.createTerminal({
                            name: `Run: ${fileName}`,
                            cwd: dir
                        });
                        term.show();

                        const isWin = process.platform === 'win32';
                        const ext = path.extname(filePath).toLowerCase();
                        if (isWin) {
                            if (ext === '.ps1') {
                                term.sendText(`powershell -ExecutionPolicy Bypass -File "${filePath}"`);
                            } else if (ext === '.bat' || ext === '.cmd') {
                                term.sendText(`& "${filePath}"`);
                            } else {
                                term.sendText(`"${filePath}"`);
                            }
                        } else {
                            if (ext === '.sh' || ext === '.command' || ext === '.bash' || ext === '.zsh') {
                                term.sendText(`chmod +x "${filePath}" && "${filePath}"`);
                            } else if (ext === '.py') {
                                term.sendText(`python3 "${filePath}"`);
                            } else {
                                term.sendText(`"${filePath}"`);
                            }
                        }
                    }
                } else if (message.command === 'smartOpenFile') {
                    if (message.path && fs.existsSync(message.path)) {
                        const filePath = message.path;
                        const ext = path.extname(filePath).toLowerCase();
                        const isScript = ['.bat', '.cmd', '.sh', '.command', '.bash', '.zsh', '.ps1'].includes(ext);
                        const isSystemDoc = [
                            '.xlsx', '.xls', '.xlsm', '.docx', '.doc', '.pptx', '.ppt',
                            '.pdf', '.numbers', '.pages', '.keynote',
                            '.mp4', '.mov', '.avi', '.mkv', '.mp3', '.wav', '.flac', '.aac',
                            '.psd', '.ai', '.epub', '.exe', '.msi', '.dmg', '.pkg', '.app'
                        ].includes(ext);

                        if (isScript) {
                            const dir = path.dirname(filePath);
                            const fileName = path.basename(filePath);
                            const term = vscode.window.createTerminal({
                                name: `Run: ${fileName}`,
                                cwd: dir
                            });
                            term.show();
                            if (process.platform === 'win32') {
                                if (ext === '.ps1') {
                                    term.sendText(`powershell -ExecutionPolicy Bypass -File "${filePath}"`);
                                } else {
                                    term.sendText(`& "${filePath}"`);
                                }
                            } else {
                                term.sendText(`chmod +x "${filePath}" && "${filePath}"`);
                            }
                        } else if (isSystemDoc) {
                            try {
                                const success = await vscode.env.openExternal(vscode.Uri.file(filePath));
                                if (!success) {
                                    vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(filePath));
                                }
                            } catch (e: any) {
                                vscode.window.showErrorMessage(`Could not open with system app: ${e.message}`);
                            }
                        } else {
                            try {
                                await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath));
                            } catch {
                                const doc = await vscode.workspace.openTextDocument(filePath);
                                await vscode.window.showTextDocument(doc, { preview: false });
                            }
                        }
                    }
                } else if (message.command === 'openSettings') {
                    vscode.commands.executeCommand('workbench.action.openSettings', 'venel.filemanager');
                } else if (message.command === 'toggleSidebar') {
                    vscode.commands.executeCommand('workbench.action.toggleSidebarVisibility');
                } else if (message.command === 'openTerminal') {
                    if (message.path) {
                        let dir = message.path;
                        try {
                            if (fs.existsSync(dir) && !fs.statSync(dir).isDirectory()) {
                                dir = path.dirname(dir);
                            }
                        } catch {}
                        const term = vscode.window.createTerminal({
                            name: `VenEl: ${path.basename(dir) || 'Terminal'}`,
                            cwd: dir
                        });
                        term.show();
                    }
                } else if (message.command === 'revealInOS') {
                    if (message.path && fs.existsSync(message.path)) {
                        vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(message.path));
                    }
                } else if (message.command === 'diffWithHead') {
                    if (message.path && fs.existsSync(message.path)) {
                        try {
                            await vscode.commands.executeCommand('git.openChange', vscode.Uri.file(message.path));
                        } catch {
                            fetch(`http://localhost:5050/api/files/diffWithHead?path=${encodeURIComponent(message.path)}`).catch(() => {});
                        }
                    }
                } else if (message.command === 'diffFiles') {
                    if (message.fileA && message.fileB) {
                        try {
                            const uriA = vscode.Uri.file(message.fileA);
                            const uriB = vscode.Uri.file(message.fileB);
                            const title = `${path.basename(message.fileA)} ↔ ${path.basename(message.fileB)}`;
                            await vscode.commands.executeCommand('vscode.diff', uriA, uriB, title);
                        } catch (err: any) {
                            vscode.window.showErrorMessage(`Could not open diff: ${err?.message || err}`);
                        }
                    }
                } else if (message.command === 'copyToClipboard') {
                    if (message.text) {
                        vscode.env.clipboard.writeText(message.text);
                    }
                } else if (message.command === 'saveFile') {
                    const target = message.filePath || message.path;
                    if (target) {
                        try {
                            await fs.promises.writeFile(target, message.content ?? '', 'utf8');
                            vscode.window.setStatusBarMessage(`$(check) VenEl: Saved ${path.basename(target)}`, 3000);
                        } catch (err: any) {
                            vscode.window.showErrorMessage(`Failed to save file: ${err?.message || err}`);
                        }
                    }
                } else if (message.command === 'askAi') {
                    const { prompt, fullText, fileName, filePath, tokenCount } = message;
                    const textToCopy = fullText || prompt || '';
                    if (textToCopy) {
                        await vscode.env.clipboard.writeText(textToCopy);
                    }
                    const tokenLabel = tokenCount ? ` (~${tokenCount.toLocaleString()} tokens)` : '';
                    vscode.window.showInformationMessage(
                        `VenEl AI Context: Prompt for '${fileName || 'item'}'${tokenLabel} copied to clipboard! Ready to paste into Chat or Cursor.`,
                        'Open Chat',
                        'Open File'
                    ).then(async (action) => {
                        if (action === 'Open Chat') {
                            try {
                                await vscode.commands.executeCommand('workbench.action.chat.open');
                            } catch {
                                try {
                                    await vscode.commands.executeCommand('workbench.action.quickchat.toggle');
                                } catch {}
                            }
                        } else if (action === 'Open File' && filePath) {
                            try {
                                const doc = await vscode.workspace.openTextDocument(filePath);
                                await vscode.window.showTextDocument(doc, { preview: false });
                            } catch {}
                        }
                    });
                } else if (message.command === 'openAsWorkspace') {
                    if (message.path && fs.existsSync(message.path)) {
                        const targetUri = vscode.Uri.file(message.path);
                        const openInNewWindow = message.newWindow ?? false;
                        await vscode.commands.executeCommand('vscode.openFolder', targetUri, { forceNewWindow: openInNewWindow });
                    }
                } else if (message.command === 'addToWorkspace') {
                    if (message.path && fs.existsSync(message.path)) {
                        const targetUri = vscode.Uri.file(message.path);
                        const currentCount = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders.length : 0;
                        const success = vscode.workspace.updateWorkspaceFolders(currentCount, null, { uri: targetUri });
                        if (success) {
                            vscode.window.showInformationMessage(`Added "${path.basename(message.path)}" to ${FileManagerPanel.getIdeDisplayName()} workspace!`);
                        }
                    }
                } else if (message.command === 'setWorkingDir') {
                    if (message.path) {
                        vscode.window.setStatusBarMessage(`$(briefcase) VenEl: Working Directory -> ${path.basename(message.path)}`, 3000);
                    }
                } else if (message.command === 'openLogsFolder') {
                    Logger.revealLogFolder();
                } else if (message.command === 'openTodayLog') {
                    Logger.openTodayLog();
                } else if (message.command === 'logError') {
                    Logger.error(message.text || 'UI Error', message.error);
                } else if (message.command === 'getRecentLogs') {
                    this._panel.webview.postMessage({
                        command: 'recent-logs-data',
                        logs: Logger.getRecentLogs(35)
                    });
                } else if (message.command === 'openExternalUrl') {
                    if (message.url) {
                        try {
                            vscode.env.openExternal(vscode.Uri.parse(message.url));
                        } catch (e: any) {
                            Logger.error('Failed to open external URL:', e);
                        }
                    }
                }
            },
            null,
            this._disposables
        );
    }

    public openIssueModal(): void {
        if (this._panel && this._panel.webview) {
            this._panel.webview.postMessage({
                command: 'open-issue-modal',
                logs: Logger.getRecentLogs(35),
                version: FileManagerPanel.getExtensionVersion()
            });
        }
    }

    public static getIdeDisplayName(): string {
        const appName = vscode.env.appName || 'IDE';
        if (/visual studio code/i.test(appName)) return 'VS Code';
        if (/cursor/i.test(appName)) return 'Cursor';
        if (/antigravity/i.test(appName)) return 'Antigravity';
        if (/devin/i.test(appName)) return 'Devin';
        if (/windsurf/i.test(appName)) return 'Windsurf';
        if (/vscodium/i.test(appName)) return 'VSCodium';
        return appName;
    }

    public static getIdeThemeKind(): string {
        const kind = vscode.window.activeColorTheme.kind;
        if (kind === vscode.ColorThemeKind.Light) {
            return 'light';
        }
        if (kind === vscode.ColorThemeKind.HighContrastLight) {
            return 'high-contrast-light';
        }
        if (kind === vscode.ColorThemeKind.HighContrast) {
            return 'high-contrast';
        }
        return 'dark';
    }

    public sendThemeUpdate() {
        const themeKind = FileManagerPanel.getIdeThemeKind();
        const ideName = FileManagerPanel.getIdeDisplayName();
        const workspaceFolders = vscode.workspace.workspaceFolders 
            ? vscode.workspace.workspaceFolders.map(wf => ({ name: wf.name, path: wf.uri.fsPath })) 
            : [];
        this._panel.webview.postMessage({
            command: 'ide-theme-changed',
            themeKind: themeKind,
            ideName: ideName,
            version: FileManagerPanel.getExtensionVersion(),
            workspaceFolders: workspaceFolders
        });
    }

    public async refresh() {
        const serverUrl = await ServerManager.getServerUrl();
        const ideTheme = FileManagerPanel.getIdeThemeKind();
        this._panel.webview.html = this.getFrameHtml(serverUrl, ideTheme);
    }

    public static getExtensionVersion(): string {
        try {
            const ext = vscode.extensions.getExtension('venkateshellur.venel-filemanager');
            if (ext && ext.packageJSON && ext.packageJSON.version) {
                return ext.packageJSON.version;
            }
        } catch {}
        return '1.1.3';
    }

    private getFrameHtml(serverUrl: string, initialThemeKind: string = 'dark'): string {
        const ideName = FileManagerPanel.getIdeDisplayName();
        const extensionVersion = FileManagerPanel.getExtensionVersion();
        const workspaceFolders = vscode.workspace.workspaceFolders 
            ? vscode.workspace.workspaceFolders.map(wf => ({ name: wf.name, path: wf.uri.fsPath })) 
            : [];
        const primaryWorkspace = workspaceFolders.length > 0 ? workspaceFolders[0].path : '';

        const delimiter = serverUrl.includes('?') ? '&' : '?';
        const targetUrl = serverUrl !== 'about:blank' 
            ? `${serverUrl}${delimiter}ideTheme=${encodeURIComponent(initialThemeKind)}&ideName=${encodeURIComponent(ideName)}&workspace=${encodeURIComponent(primaryWorkspace)}&version=${encodeURIComponent(extensionVersion)}` 
            : '';

        return `<!DOCTYPE html>
<html lang="en" style="height: 100%; margin: 0; padding: 0;">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>VenEl File Manager</title>
    <style>
        body {
            height: 100%;
            margin: 0;
            padding: 0;
            overflow: hidden;
            background-color: var(--vscode-editor-background, #121214);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: var(--vscode-foreground, #cccccc);
        }
        #loading-overlay {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background-color: var(--vscode-editor-background, #121214);
            z-index: 100;
            transition: opacity 0.3s ease, visibility 0.3s ease;
            text-align: center;
            padding: 24px;
        }
        .spinner {
            width: 38px;
            height: 38px;
            border: 3px solid rgba(108, 92, 231, 0.2);
            border-top-color: #6c5ce7;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
            margin-bottom: 16px;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        .loading-title {
            font-size: 15px;
            font-weight: 600;
            color: var(--vscode-foreground, #e0e0e0);
            margin-bottom: 8px;
        }
        .loading-hint {
            font-size: 12px;
            color: var(--vscode-descriptionForeground, #888888);
            max-width: 390px;
            line-height: 1.5;
        }
        .loading-badge {
            display: inline-block;
            margin-top: 14px;
            padding: 4px 12px;
            background: rgba(108, 92, 231, 0.12);
            border: 1px solid rgba(108, 92, 231, 0.25);
            border-radius: 12px;
            font-size: 11px;
            color: #a29bfe;
        }
        iframe {
            width: 100%;
            height: 100%;
            border: none;
            opacity: 0;
            transition: opacity 0.25s ease;
        }
        iframe.loaded {
            opacity: 1;
        }
    </style>
</head>
<body>
    <div id="loading-overlay">
        <div class="spinner"></div>
        <div class="loading-title">Starting VenEl Engine...</div>
        <div class="loading-hint">First launch takes a few moments while the engine initializes routes and scans system drives. Subsequent launches and folder navigations are instant!</div>
        <div class="loading-badge">⚡ Initialization in progress</div>
        <button id="btn-retry-launch" onclick="retryConnection()" style="display: none; margin-top: 14px; padding: 6px 16px; background: #6c5ce7; color: white; border: none; border-radius: 6px; font-size: 12px; cursor: pointer;">🔄 Reconnect Engine</button>
    </div>
    ${targetUrl !== '' ? `<iframe id="engine-frame" src="${targetUrl}" onload="onFrameLoad()"></iframe>` : ''}
    <script>
        const vscode = acquireVsCodeApi();
        let currentThemeKind = '${initialThemeKind}';

        function sendThemeToFrame() {
            const frame = document.getElementById('engine-frame');
            if (!frame || !frame.contentWindow) return;
            const cs = window.getComputedStyle(document.body);
            const isLight = document.body.classList.contains('vscode-light');
            const isHcLight = document.body.classList.contains('vscode-high-contrast-light');
            const isHc = document.body.classList.contains('vscode-high-contrast');
            let themeKind = currentThemeKind || 'dark';
            if (isHcLight) themeKind = 'high-contrast-light';
            else if (isHc) themeKind = 'high-contrast';
            else if (isLight) themeKind = 'light';
            else if (document.body.classList.contains('vscode-dark')) themeKind = 'dark';

            const themePayload = {
                command: 'ide-theme-changed',
                themeKind: themeKind,
                ideName: '${ideName}',
                workspaceFolders: ${JSON.stringify(workspaceFolders)},
                primaryWorkspace: '${primaryWorkspace.replace(/\\/g, '\\\\')}',
                isLight: isLight,
                isHighContrast: isHc || isHcLight,
                bodyClass: document.body.className,
                vars: {
                    '--vscode-editor-background': cs.getPropertyValue('--vscode-editor-background').trim() || (isLight ? '#ffffff' : '#121214'),
                    '--vscode-editor-foreground': cs.getPropertyValue('--vscode-editor-foreground').trim() || (isLight ? '#22252a' : '#e0e0e0'),
                    '--vscode-sideBar-background': cs.getPropertyValue('--vscode-sideBar-background').trim() || (isLight ? '#f5f6f8' : '#15151a'),
                    '--vscode-sideBar-foreground': cs.getPropertyValue('--vscode-sideBar-foreground').trim() || (isLight ? '#22252a' : '#e0e0e0'),
                    '--vscode-sideBar-border': cs.getPropertyValue('--vscode-sideBar-border').trim() || (isLight ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.1)'),
                    '--vscode-focusBorder': cs.getPropertyValue('--vscode-focusBorder').trim() || '#6c5ce7',
                    '--vscode-list-hoverBackground': cs.getPropertyValue('--vscode-list-hoverBackground').trim() || (isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.08)'),
                    '--vscode-list-activeSelectionBackground': cs.getPropertyValue('--vscode-list-activeSelectionBackground').trim() || 'rgba(108, 92, 231, 0.22)',
                    '--vscode-list-activeSelectionForeground': cs.getPropertyValue('--vscode-list-activeSelectionForeground').trim() || '#ffffff',
                    '--vscode-input-background': cs.getPropertyValue('--vscode-input-background').trim() || (isLight ? '#ffffff' : '#18181e'),
                    '--vscode-input-foreground': cs.getPropertyValue('--vscode-input-foreground').trim() || (isLight ? '#22252a' : '#e0e0e0'),
                    '--vscode-input-border': cs.getPropertyValue('--vscode-input-border').trim() || (isLight ? 'rgba(0, 0, 0, 0.18)' : 'rgba(255, 255, 255, 0.15)'),
                    '--vscode-editorWidget-background': cs.getPropertyValue('--vscode-editorWidget-background').trim() || (isLight ? '#ffffff' : '#1c1c21'),
                    '--vscode-editorWidget-border': cs.getPropertyValue('--vscode-editorWidget-border').trim() || (isLight ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.1)'),
                    '--vscode-menu-background': cs.getPropertyValue('--vscode-menu-background').trim() || (isLight ? '#ffffff' : '#1c1c24'),
                    '--vscode-menu-foreground': cs.getPropertyValue('--vscode-menu-foreground').trim() || (isLight ? '#22252a' : '#f1f2f6'),
                    '--vscode-menu-selectionBackground': cs.getPropertyValue('--vscode-menu-selectionBackground').trim() || (isLight ? '#eef1f6' : '#2d2654'),
                    '--vscode-menu-selectionForeground': cs.getPropertyValue('--vscode-menu-selectionForeground').trim() || '#ffffff',
                    '--vscode-editorGroupHeader-tabsBackground': cs.getPropertyValue('--vscode-editorGroupHeader-tabsBackground').trim() || (isLight ? '#e9ecef' : '#0d0d11'),
                    '--vscode-tab-activeBackground': cs.getPropertyValue('--vscode-tab-activeBackground').trim() || (isLight ? '#ffffff' : '#141418'),
                    '--vscode-tab-activeForeground': cs.getPropertyValue('--vscode-tab-activeForeground').trim() || (isLight ? '#1e272e' : '#ffffff'),
                    '--vscode-panel-background': cs.getPropertyValue('--vscode-panel-background').trim() || (isLight ? '#ffffff' : '#121214'),
                    '--vscode-descriptionForeground': cs.getPropertyValue('--vscode-descriptionForeground').trim() || (isLight ? '#636e72' : '#888899'),
                    '--vscode-scrollbarSlider-background': cs.getPropertyValue('--vscode-scrollbarSlider-background').trim() || (isLight ? 'rgba(0, 0, 0, 0.22)' : 'rgba(255, 255, 255, 0.22)'),
                    '--vscode-scrollbarSlider-hoverBackground': cs.getPropertyValue('--vscode-scrollbarSlider-hoverBackground').trim() || (isLight ? 'rgba(0, 0, 0, 0.38)' : 'rgba(255, 255, 255, 0.38)'),
                    '--vscode-scrollbarSlider-activeBackground': cs.getPropertyValue('--vscode-scrollbarSlider-activeBackground').trim() || (isLight ? 'rgba(0, 0, 0, 0.55)' : 'rgba(255, 255, 255, 0.55)')
                }
            };
            try {
                frame.contentWindow.postMessage(themePayload, '*');
            } catch (e) {}
        }

        window.addEventListener('message', function(event) {
            const frame = document.getElementById('engine-frame');
            const isFromIframe = frame && frame.contentWindow && event.source === frame.contentWindow;

            if (isFromIframe) {
                // Message from inner iframe -> forward to VS Code extension host
                if (event.data && (event.data.command === 'request-ide-theme' || event.data.command === 'request-ide-info')) {
                    sendThemeToFrame();
                    return;
                }
                if (event.data && event.data.command) {
                    vscode.postMessage(event.data);
                }
            } else {
                // Message from VS Code extension host -> forward to inner iframe
                if (event.data && event.data.command === 'ide-theme-changed') {
                    if (event.data.themeKind) {
                        currentThemeKind = event.data.themeKind;
                    }
                    sendThemeToFrame();
                }
                if (frame && frame.contentWindow && event.data) {
                    try {
                        frame.contentWindow.postMessage(event.data, '*');
                    } catch (e) {}
                }
            }
        });

        const themeObserver = new MutationObserver(function() {
            sendThemeToFrame();
        });
        themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });

        function onFrameLoad() {
            const overlay = document.getElementById('loading-overlay');
            const frame = document.getElementById('engine-frame');
            if (overlay) {
                overlay.style.opacity = '0';
                overlay.style.visibility = 'hidden';
            }
            if (frame) {
                frame.classList.add('loaded');
            }
            sendThemeToFrame();
        }
        setTimeout(onFrameLoad, 3000);
        setTimeout(function() {
            const retryBtn = document.getElementById('btn-retry-launch');
            const overlay = document.getElementById('loading-overlay');
            if (retryBtn && overlay && overlay.style.visibility !== 'hidden') {
                retryBtn.style.display = 'inline-block';
            }
        }, 3500);

        function retryConnection() {
            vscode.postMessage({ command: 'retry' });
        }
    </script>
</body>
</html>`;
    }

    public dispose() {
        FileManagerPanel.currentPanel = undefined;

        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}
