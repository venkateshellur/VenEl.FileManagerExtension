import * as vscode from 'vscode';
import { ServerManager } from './serverManager';

export class FileManagerPanel {
    public static currentPanel: FileManagerPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (FileManagerPanel.currentPanel) {
            FileManagerPanel.currentPanel._panel.reveal(column);
            FileManagerPanel.currentPanel.refresh();
            return;
        }

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

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        this._panel.iconPath = {
            light: vscode.Uri.joinPath(this._extensionUri, 'media', 'logo.png'),
            dark: vscode.Uri.joinPath(this._extensionUri, 'media', 'logo.png')
        };

        this.refresh();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                if (message.command === 'retry') {
                    this.refresh();
                } else if (message.command === 'updateServerUrl') {
                    const config = vscode.workspace.getConfiguration('venel.filemanager');
                    await config.update('serverUrl', message.url, vscode.ConfigurationTarget.Global);
                    this.refresh();
                }
            },
            null,
            this._disposables
        );
    }

    public async refresh() {
        const serverUrl = ServerManager.getServerUrl();
        const health = await ServerManager.checkHealth();
        this._panel.webview.html = this._getHtmlForWebview(serverUrl, health.online, health.message);
    }

    private _getHtmlForWebview(serverUrl: string, online: boolean, statusMsg: string): string {
        if (!online) {
            return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>VenEl File Manager</title>
    <style>
        body {
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif);
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            padding: 24px;
            box-sizing: border-box;
        }
        .card {
            background-color: var(--vscode-sideBar-background);
            border: 1px solid var(--vscode-widget-border, rgba(255, 255, 255, 0.1));
            border-radius: 14px;
            padding: 36px 40px;
            max-width: 540px;
            text-align: center;
            box-shadow: 0 12px 35px rgba(0,0,0,0.35);
        }
        .icon {
            font-size: 48px;
            margin-bottom: 14px;
        }
        h2 {
            margin: 0 0 10px 0;
            font-size: 20px;
            color: var(--vscode-editor-foreground);
        }
        p {
            color: var(--vscode-descriptionForeground);
            font-size: 13px;
            line-height: 1.6;
            margin: 0 0 16px 0;
        }
        .badge {
            display: inline-block;
            background: rgba(235, 87, 87, 0.15);
            color: #eb5757;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            margin-bottom: 14px;
        }
        .code-block {
            background: rgba(0, 0, 0, 0.25);
            border: 1px solid var(--vscode-widget-border, rgba(255, 255, 255, 0.1));
            padding: 10px 14px;
            border-radius: 6px;
            font-family: monospace;
            font-size: 12px;
            text-align: left;
            margin: 12px 0;
            color: #74b9ff;
        }
        .url-box {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid var(--vscode-widget-border, rgba(255, 255, 255, 0.1));
            border-radius: 8px;
            padding: 14px;
            margin: 16px 0;
            text-align: left;
        }
        .url-box label {
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--vscode-descriptionForeground);
            display: block;
            margin-bottom: 8px;
        }
        .url-row {
            display: flex;
            gap: 8px;
        }
        input[type="text"] {
            flex: 1;
            background: var(--vscode-input-background, #1e1e1e);
            color: var(--vscode-input-foreground, #fff);
            border: 1px solid var(--vscode-input-border, rgba(255,255,255,0.2));
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 13px;
            outline: none;
        }
        input[type="text"]:focus {
            border-color: var(--vscode-focusBorder, #007acc);
        }
        button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 6px;
            padding: 9px 18px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.15s ease;
        }
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        .btn-secondary {
            background: transparent;
            color: var(--vscode-descriptionForeground);
            border: 1px solid var(--vscode-widget-border, rgba(255, 255, 255, 0.15));
            padding: 8px 16px;
            font-size: 12px;
            margin-top: 10px;
        }
        .btn-secondary:hover {
            background-color: var(--vscode-toolbar-hoverBackground, rgba(255, 255, 255, 0.05));
            color: var(--vscode-foreground);
        }
        .hint {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-top: 8px;
            line-height: 1.4;
        }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">🔌</div>
        <div class="badge">Engine Offline</div>
        <h2>Cannot Connect to VenEl Engine</h2>
        <p>The File Manager requires the local VenEl MCP engine running on <strong>${serverUrl}</strong>.</p>
        
        <div class="url-box">
            <label for="serverUrlInput">Engine Server URL / Host IP</label>
            <div class="url-row">
                <input id="serverUrlInput" type="text" value="${serverUrl}" placeholder="http://localhost:5050 or http://192.168.1.174:5050" />
                <button onclick="saveAndConnect()">Connect</button>
            </div>
            <div class="hint">
                💡 If VS Code is on a VM, Remote Desktop, or another machine on the LAN, enter your host IP (e.g. <code>http://192.168.1.174:5050</code>).
            </div>
        </div>

        <p style="font-size: 12px; margin-bottom: 4px;">To run the local engine from repository source:</p>
        <div class="code-block">
            dotnet run --project src/VenEl.MCP.Server
        </div>
        <p style="font-size: 11px; color: #e74c3c;">${statusMsg}</p>
        <button class="btn-secondary" onclick="retry()">🔄 Retry Connection</button>
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        function retry() {
            vscode.postMessage({ command: 'retry' });
        }
        function saveAndConnect() {
            const input = document.getElementById('serverUrlInput');
            if (input && input.value) {
                vscode.postMessage({ command: 'updateServerUrl', url: input.value.trim() });
            }
        }
    </script>
</body>
</html>`;
        }

        return `<!DOCTYPE html>
<html lang="en" style="height: 100%; margin: 0; padding: 0;">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>VenEl File Manager</title>
</head>
<body style="height: 100%; margin: 0; padding: 0; overflow: hidden; background-color: var(--vscode-editor-background, #121214);">
    <iframe src="${serverUrl}" style="width: 100%; height: 100%; border: none;"></iframe>
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
