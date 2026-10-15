import * as vscode from 'vscode';
import { ServerManager } from './serverManager';
import { LocalServer } from './localServer';

export class FileManagerPanel {
    public static currentPanel: FileManagerPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    public static async createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (FileManagerPanel.currentPanel) {
            FileManagerPanel.currentPanel._panel.reveal(column);
            await FileManagerPanel.currentPanel.refresh();
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
                }
            },
            null,
            this._disposables
        );
    }

    public async refresh() {
        const serverUrl = await ServerManager.getServerUrl();
        this._panel.webview.html = this.getFrameHtml(serverUrl);
    }

    private getFrameHtml(serverUrl: string): string {
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
    ${serverUrl !== 'about:blank' ? `<iframe id="engine-frame" src="${serverUrl}" onload="onFrameLoad()"></iframe>` : ''}
    <script>
        const vscode = acquireVsCodeApi();
        window.addEventListener('message', function(event) {
            if (event.data && event.data.command) {
                vscode.postMessage(event.data);
            }
        });
        function onFrameLoad() {
            const overlay = document.getElementById('loading-overlay');
            const frame = document.getElementById('engine-frame');
            if (overlay && frame) {
                frame.classList.add('loaded');
                overlay.style.opacity = '0';
                overlay.style.visibility = 'hidden';
            }
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
