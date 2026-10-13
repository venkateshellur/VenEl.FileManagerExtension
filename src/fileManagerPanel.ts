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
                }
            },
            null,
            this._disposables
        );
    }

    public async refresh() {
        const serverUrl = await ServerManager.getServerUrl();
        this._panel.webview.html = `<!DOCTYPE html>
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
