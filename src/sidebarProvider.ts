import * as vscode from 'vscode';
import { ServerManager } from './serverManager';
import { FileManagerPanel } from './fileManagerPanel';

export class SidebarProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'venel.filemanager.sidebar';
    private _view?: vscode.WebviewView;
    private _lastDirectOpen = 0;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        // 1. Immediately render complete UI with warming/progress indicator (0ms blank delay!)
        this._view.webview.html = this.getHtml({
            status: 'warming',
            message: 'Getting things ready in background...',
            url: 'http://localhost:5050'
        });

        // 2. Perform background health check to update the status seamlessly
        this.checkAndUpdateStatus();

        // 3. Direct-To-Editor on click of Activity Bar icon (Option A)
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this.triggerDirectOpen();
                this.checkAndUpdateStatus();
            }
        });

        // Trigger on initial resolution if view is visible
        if (webviewView.visible) {
            this.triggerDirectOpen();
        }

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'openTab':
                    vscode.commands.executeCommand('venel.filemanager.open');
                    break;
                case 'checkHealth':
                    await this.checkAndUpdateStatus();
                    break;
                case 'openSettings':
                    vscode.commands.executeCommand('workbench.action.openSettings', 'venel.filemanager');
                    break;
            }
        });
    }

    private triggerDirectOpen() {
        const now = Date.now();
        // Debounce to prevent multiple triggers within 600ms
        if (now - this._lastDirectOpen < 600) {
            return;
        }
        this._lastDirectOpen = now;

        const config = vscode.workspace.getConfiguration('venel.filemanager');
        const directOpen = config.get<boolean>('directOpenEditor', true);
        if (!directOpen) {
            return;
        }

        // Open or reveal the File Manager editor tab directly!
        FileManagerPanel.createOrShow(this._extensionUri);

        // Option A: Auto-collapse the left VS Code sidebar to give 100% full width
        const autoCollapse = config.get<boolean>('autoCollapseSidebar', true);
        if (autoCollapse) {
            setTimeout(() => {
                vscode.commands.executeCommand('workbench.action.closeSidebar');
            }, 80);
        }
    }

    public async checkAndUpdateStatus() {
        if (!this._view) {
            return;
        }

        const health = await ServerManager.checkHealth();
        if (this._view) {
            this._view.webview.postMessage({
                type: 'statusUpdate',
                status: health.online ? 'online' : 'offline',
                message: health.message,
                url: health.url
            });
        }
    }

    public updateView() {
        this.checkAndUpdateStatus();
    }

    private getHtml(state: { status: 'warming' | 'online' | 'offline'; message: string; url: string }): string {
        const logoUri = this._view
            ? this._view.webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'logo.png'))
            : '';

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 16px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-sideBar-background);
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            gap: 16px;
        }
        .header {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .header-logo {
            width: 32px;
            height: 32px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 206, 209, 0.3);
        }
        .title {
            font-size: 14px;
            font-weight: 600;
        }
        .status-card {
            background-color: rgba(255, 255, 255, 0.04);
            border: 1px solid var(--vscode-widget-border, rgba(255, 255, 255, 0.1));
            border-radius: 8px;
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        .status-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 12px;
        }
        .dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            display: inline-block;
            margin-right: 6px;
            vertical-align: middle;
        }
        .dot.online { background-color: #2ecc71; box-shadow: 0 0 6px #2ecc71; }
        .dot.offline { background-color: #e74c3c; box-shadow: 0 0 6px #e74c3c; }
        .dot.warming {
            background-color: #f39c12;
            box-shadow: 0 0 8px #f39c12;
            animation: pulse 1s infinite alternate;
        }
        @keyframes pulse {
            0% { opacity: 0.5; transform: scale(0.9); }
            100% { opacity: 1; transform: scale(1.15); }
        }
        .progress-bar-container {
            height: 4px;
            width: 100%;
            background: rgba(255, 255, 255, 0.08);
            border-radius: 2px;
            overflow: hidden;
            margin-top: 6px;
        }
        .progress-bar-fill {
            height: 100%;
            width: 45%;
            background: linear-gradient(90deg, #6c5ce7, #00cec9);
            border-radius: 2px;
            animation: indeterminate 1.3s infinite ease-in-out;
        }
        @keyframes indeterminate {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(300%); }
        }
        .warming-text {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-top: 6px;
            line-height: 1.4;
        }
        .btn-primary {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 6px;
            padding: 12px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            transition: 0.15s;
        }
        .btn-primary:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        .btn-secondary {
            background: transparent;
            color: var(--vscode-descriptionForeground);
            border: 1px solid var(--vscode-widget-border, rgba(255, 255, 255, 0.1));
            border-radius: 6px;
            padding: 8px;
            font-size: 11px;
            cursor: pointer;
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
        }
        .btn-secondary:hover {
            background-color: var(--vscode-toolbar-hoverBackground, rgba(255, 255, 255, 0.05));
            color: var(--vscode-foreground);
        }
        .features-list {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            line-height: 1.6;
        }
        .features-list li {
            margin-bottom: 4px;
        }
        .tip-box {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            background: rgba(108, 92, 231, 0.08);
            border: 1px solid rgba(108, 92, 231, 0.2);
            border-radius: 6px;
            padding: 8px 10px;
            line-height: 1.4;
        }
    </style>
</head>
<body>
    <div class="header">
        <img class="header-logo" src="${logoUri}" alt="VenEl File Manager" />
        <div>
            <div class="title">VenEl File Manager</div>
            <div style="font-size: 11px; color: var(--vscode-descriptionForeground);">Visual MCP Explorer</div>
        </div>
    </div>

    <button class="btn-primary" onclick="openTab()">
        <span>🚀 Open Full-Screen Tab</span>
    </button>
    
    <div class="tip-box">
        ⚡ <strong>Option A Active:</strong> Clicking the Activity Bar icon directly opens the full editor tab and collapses this sidebar for maximum screen real estate.
    </div>

    <div class="status-card">
        <div class="status-row">
            <span>Engine Status:</span>
            <span>
                <span class="dot ${state.status}" id="status-dot"></span>
                <strong id="status-title">${state.status === 'online' ? 'Ready & Online' : (state.status === 'warming' ? 'Getting things ready...' : 'Offline')}</strong>
            </span>
        </div>
        <div class="status-row" style="color: var(--vscode-descriptionForeground); font-size: 11px;">
            <span>Endpoint:</span>
            <span id="status-endpoint">${state.url}</span>
        </div>
        <div id="warming-indicator" style="display: ${state.status === 'online' ? 'none' : 'block'};">
            <div class="progress-bar-container">
                <div class="progress-bar-fill"></div>
            </div>
            <div class="warming-text" id="status-hint">⚡ Getting things ready in the background...</div>
        </div>
    </div>

    <button class="btn-secondary" onclick="checkHealth()">
        🔄 Refresh Status
    </button>

    <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--vscode-descriptionForeground);">
        ✨ Features
    </div>
    <ul class="features-list" style="padding-left: 18px; margin: 0;">
        <li>⚡ Instant Full-Screen Editor Launch</li>
        <li>🤖 Machine-Level Agent Search (Spotlight)</li>
        <li>⊞ Multi-View (Details, List, Grid, Icons)</li>
        <li>↔️ Draggable Resizable Splitters</li>
        <li>👁️ Live Code & Image Previews</li>
    </ul>

    <button class="btn-secondary" onclick="openSettings()">
        ⚙️ Settings & Options
    </button>

    <div style="margin-top: auto; padding-top: 12px; border-top: 1px solid var(--vscode-widget-border, rgba(255, 255, 255, 0.08)); font-size: 11px; color: var(--vscode-descriptionForeground); display: flex; flex-direction: column; gap: 8px; text-align: center;">
        <div>Developed with ❤️ by <strong style="color: var(--vscode-foreground);">Venkatesh Ellur</strong></div>
        <div style="display: flex; justify-content: center; gap: 12px;">
            <a href="https://www.linkedin.com/in/venkateshellur/" style="color: #0077b5; text-decoration: none; font-weight: 500; display: inline-flex; align-items: center; gap: 4px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/></svg>
                LinkedIn
            </a>
            <span>•</span>
            <a href="https://github.com/venkateshellur/VenEl.FileManagerExtension" style="color: var(--vscode-textLink-foreground); text-decoration: none;">GitHub</a>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        function openTab() {
            vscode.postMessage({ type: 'openTab' });
        }
        function checkHealth() {
            const dot = document.getElementById('status-dot');
            const title = document.getElementById('status-title');
            const indicator = document.getElementById('warming-indicator');
            const hint = document.getElementById('status-hint');
            if (dot) dot.className = 'dot warming';
            if (title) title.textContent = 'Checking status...';
            if (indicator) indicator.style.display = 'block';
            if (hint) hint.textContent = '⚡ Checking engine connection...';
            vscode.postMessage({ type: 'checkHealth' });
        }
        function openSettings() {
            vscode.postMessage({ type: 'openSettings' });
        }
        window.addEventListener('message', (event) => {
            const msg = event.data;
            if (msg.type === 'statusUpdate') {
                const dot = document.getElementById('status-dot');
                const title = document.getElementById('status-title');
                const endpoint = document.getElementById('status-endpoint');
                const indicator = document.getElementById('warming-indicator');
                const hint = document.getElementById('status-hint');
                if (dot) dot.className = 'dot ' + (msg.status === 'online' ? 'online' : 'offline');
                if (title) title.textContent = msg.status === 'online' ? 'Ready & Online' : 'Offline';
                if (endpoint) endpoint.textContent = msg.url || 'http://localhost:5050';
                if (indicator) indicator.style.display = msg.status === 'online' ? 'none' : 'block';
                if (hint && msg.status !== 'online') {
                    hint.textContent = '⚠️ ' + (msg.message || 'Engine offline');
                }
            }
        });
    </script>
</body>
</html>`;
    }
}
