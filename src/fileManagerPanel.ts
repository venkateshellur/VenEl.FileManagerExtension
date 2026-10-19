import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ServerManager } from './serverManager';
import { LocalServer } from './localServer';

export class FileManagerPanel {
    public static currentPanel: FileManagerPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    public static async createOrShow(extensionUri: vscode.Uri) {
        // 1. Single Instance: If panel already exists, bring user to the existing instance!
        if (FileManagerPanel.currentPanel) {
            FileManagerPanel.currentPanel._panel.reveal(FileManagerPanel.currentPanel._panel.viewColumn);
            return;
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
                } else if (message.command === 'openFile') {
                    if (message.path) {
                        try {
                            const doc = await vscode.workspace.openTextDocument(message.path);
                            await vscode.window.showTextDocument(doc, { preview: false });
                        } catch (e: any) {
                            vscode.window.showErrorMessage(`Could not open file: ${e.message}`);
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
                }
            },
            null,
            this._disposables
        );
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
        this._panel.webview.postMessage({
            command: 'ide-theme-changed',
            themeKind: themeKind
        });
    }

    public async refresh() {
        const serverUrl = await ServerManager.getServerUrl();
        const ideTheme = FileManagerPanel.getIdeThemeKind();
        this._panel.webview.html = this.getFrameHtml(serverUrl, ideTheme);
    }

    private getFrameHtml(serverUrl: string, initialThemeKind: string = 'dark'): string {
        const delimiter = serverUrl.includes('?') ? '&' : '?';
        const targetUrl = serverUrl !== 'about:blank' 
            ? `${serverUrl}${delimiter}ideTheme=${encodeURIComponent(initialThemeKind)}` 
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
                isLight: isLight,
                isHighContrast: isHc || isHcLight,
                bodyClass: document.body.className,
                vars: {
                    '--vscode-editor-background': cs.getPropertyValue('--vscode-editor-background').trim(),
                    '--vscode-editor-foreground': cs.getPropertyValue('--vscode-editor-foreground').trim(),
                    '--vscode-sideBar-background': cs.getPropertyValue('--vscode-sideBar-background').trim(),
                    '--vscode-sideBar-foreground': cs.getPropertyValue('--vscode-sideBar-foreground').trim(),
                    '--vscode-sideBar-border': cs.getPropertyValue('--vscode-sideBar-border').trim(),
                    '--vscode-focusBorder': cs.getPropertyValue('--vscode-focusBorder').trim(),
                    '--vscode-list-hoverBackground': cs.getPropertyValue('--vscode-list-hoverBackground').trim(),
                    '--vscode-list-activeSelectionBackground': cs.getPropertyValue('--vscode-list-activeSelectionBackground').trim(),
                    '--vscode-list-activeSelectionForeground': cs.getPropertyValue('--vscode-list-activeSelectionForeground').trim(),
                    '--vscode-input-background': cs.getPropertyValue('--vscode-input-background').trim(),
                    '--vscode-input-foreground': cs.getPropertyValue('--vscode-input-foreground').trim(),
                    '--vscode-input-border': cs.getPropertyValue('--vscode-input-border').trim(),
                    '--vscode-editorWidget-background': cs.getPropertyValue('--vscode-editorWidget-background').trim(),
                    '--vscode-editorWidget-border': cs.getPropertyValue('--vscode-editorWidget-border').trim(),
                    '--vscode-menu-background': cs.getPropertyValue('--vscode-menu-background').trim(),
                    '--vscode-menu-foreground': cs.getPropertyValue('--vscode-menu-foreground').trim(),
                    '--vscode-menu-selectionBackground': cs.getPropertyValue('--vscode-menu-selectionBackground').trim(),
                    '--vscode-menu-selectionForeground': cs.getPropertyValue('--vscode-menu-selectionForeground').trim(),
                    '--vscode-editorGroupHeader-tabsBackground': cs.getPropertyValue('--vscode-editorGroupHeader-tabsBackground').trim(),
                    '--vscode-tab-activeBackground': cs.getPropertyValue('--vscode-tab-activeBackground').trim(),
                    '--vscode-tab-activeForeground': cs.getPropertyValue('--vscode-tab-activeForeground').trim(),
                    '--vscode-panel-background': cs.getPropertyValue('--vscode-panel-background').trim(),
                    '--vscode-descriptionForeground': cs.getPropertyValue('--vscode-descriptionForeground').trim()
                }
            };
            try {
                frame.contentWindow.postMessage(themePayload, '*');
            } catch (e) {}
        }

        window.addEventListener('message', function(event) {
            if (event.data && event.data.command === 'ide-theme-changed') {
                if (event.data.themeKind) {
                    currentThemeKind = event.data.themeKind;
                }
                sendThemeToFrame();
                const frame = document.getElementById('engine-frame');
                if (frame && frame.contentWindow) {
                    try {
                        frame.contentWindow.postMessage(event.data, '*');
                    } catch (e) {}
                }
                return;
            }
            if (event.data && event.data.command === 'request-ide-theme') {
                sendThemeToFrame();
                return;
            }
            if (event.data && event.data.command) {
                vscode.postMessage(event.data);
            }
        });

        const themeObserver = new MutationObserver(function() {
            sendThemeToFrame();
        });
        themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });

        function onFrameLoad() {
            const overlay = document.getElementById('loading-overlay');
            const frame = document.getElementById('engine-frame');
            if (overlay && frame) {
                frame.classList.add('loaded');
                overlay.style.opacity = '0';
                overlay.style.visibility = 'hidden';
            }
            sendThemeToFrame();
        }
        setTimeout(onFrameLoad, 3500);
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
