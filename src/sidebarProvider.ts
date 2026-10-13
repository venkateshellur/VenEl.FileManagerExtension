import * as vscode from 'vscode';
import { ServerManager } from './serverManager';

export class SidebarProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'venel.filemanager.sidebar';
    private _view?: vscode.WebviewView;

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

        this.updateView();

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'openTab':
                    vscode.commands.executeCommand('venel.filemanager.open');
                    break;
                case 'checkHealth':
                    this.updateView();
                    break;
                case 'openSettings':
                    vscode.commands.executeCommand('workbench.action.openSettings', 'venel.filemanager');
                    break;
            }
        });
    }

    public async updateView() {
        if (!this._view) {
            return;
        }

        const serverUrl = ServerManager.getServerUrl();
        const health = await ServerManager.checkHealth();
        const logoUri = this._view.webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'logo.png'));

        this._view.webview.html = `<!DOCTYPE html>
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
        }
        .dot.online { background-color: #2ecc71; box-shadow: 0 0 6px #2ecc71; }
        .dot.offline { background-color: #e74c3c; box-shadow: 0 0 6px #e74c3c; }
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
        <span>🚀 Open in Editor Tab</span>
    </button>

    <div class="status-card">
        <div class="status-row">
            <span>Engine Status:</span>
            <span>
                <span class="dot ${health.online ? 'online' : 'offline'}"></span>
                <strong>${health.online ? 'Online' : 'Offline'}</strong>
            </span>
        </div>
        <div class="status-row" style="color: var(--vscode-descriptionForeground); font-size: 11px;">
            <span>Endpoint:</span>
            <span>${serverUrl}</span>
        </div>
    </div>

    <button class="btn-secondary" onclick="checkHealth()">
        🔄 Refresh Status
    </button>

    <button class="btn-secondary" onclick="openSettings()">
        ⚙️ Extension Settings
    </button>

    <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--vscode-descriptionForeground);">
        Features
    </div>
    <ul class="features-list">
        <li>⊞ Default Grid card view</li>
        <li>🧭 Windows / Mac address dropdown</li>
        <li>👁️ Live split preview pane</li>
        <li>🔍 Instant local folder search</li>
    </ul>

    <script>
        const vscode = acquireVsCodeApi();
        function openTab() {
            vscode.postMessage({ type: 'openTab' });
        }
        function checkHealth() {
            vscode.postMessage({ type: 'checkHealth' });
        }
        function openSettings() {
            vscode.postMessage({ type: 'openSettings' });
        }
    </script>
</body>
</html>`;
    }
}
