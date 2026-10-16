import * as vscode from 'vscode';
import { FileManagerPanel } from './fileManagerPanel';
import { SidebarProvider } from './sidebarProvider';
import { ServerManager } from './serverManager';
import { KestrelLauncher } from './kestrelLauncher';

let statusBarItem: vscode.StatusBarItem;

export async function activate(context: vscode.ExtensionContext) {
    console.log('[VenEl] Extension activated. Starting silent background setup...');
    KestrelLauncher.init(context);

    // 0. Eagerly start background engine & pre-warm drives with 0 user delay!
    (async () => {
        try {
            const serverUrl = await ServerManager.getServerUrl();
            console.log(`[VenEl] Engine warmed and ready in background: ${serverUrl}`);
            await ServerManager.pingUrl(serverUrl);
        } catch (e) {
            console.error('[VenEl] Background setup error:', e);
        }
    })();

    // 1. Register Sidebar Webview View Provider in Activity Bar
    const sidebarProvider = new SidebarProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            SidebarProvider.viewType,
            sidebarProvider
        )
    );

    // 2. Command to open the File Manager in an Editor Tab
    const openCommand = vscode.commands.registerCommand('venel.filemanager.open', async () => {
        await FileManagerPanel.createOrShow(context.extensionUri);
    });
    context.subscriptions.push(openCommand);

    // 2b. Register Webview Panel Serializer to preserve single-instance across editor window reloads
    vscode.window.registerWebviewPanelSerializer('venelFileManager', {
        async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, _state: any) {
            FileManagerPanel.revive(webviewPanel, context.extensionUri);
        }
    });

    // 3. Command to manually check health
    const checkServerCommand = vscode.commands.registerCommand('venel.filemanager.checkServer', async () => {
        const health = await ServerManager.checkHealth();
        if (health.online) {
            vscode.window.showInformationMessage(`VenEl Engine: ${health.message}`);
        } else {
            vscode.window.showWarningMessage(`VenEl Engine Offline: ${health.message}`);
        }
        sidebarProvider.updateView();
    });
    context.subscriptions.push(checkServerCommand);

    // 4. Status Bar Item
    const config = vscode.workspace.getConfiguration('venel.filemanager');
    if (config.get<boolean>('showStatusBarItem', true)) {
        statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        statusBarItem.command = 'venel.filemanager.open';
        statusBarItem.text = '$(folder) VenEl Files';
        statusBarItem.tooltip = 'Click to open VenEl File Manager (Active in background)';
        statusBarItem.show();
        context.subscriptions.push(statusBarItem);
    }

    console.log('[VenEl] Extension active and background setup running.');
}

export function deactivate() {
    if (statusBarItem) {
        statusBarItem.dispose();
    }
    KestrelLauncher.stop();
}
