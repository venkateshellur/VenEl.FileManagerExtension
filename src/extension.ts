import * as vscode from 'vscode';
import { FileManagerPanel } from './fileManagerPanel';
import { SidebarProvider } from './sidebarProvider';
import { ServerManager } from './serverManager';
import { LocalServer } from './localServer';

let statusBarItem: vscode.StatusBarItem;

export async function activate(context: vscode.ExtensionContext) {
    console.log('VenEl File Manager extension activating...');

    // Automatically ensure built-in local engine is active on install!
    try {
        await LocalServer.ensureRunning();
    } catch (e) {
        console.error('Failed to pre-start local engine:', e);
    }

    // 1. Register Sidebar Webview View Provider in Activity Bar
    const sidebarProvider = new SidebarProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            SidebarProvider.viewType,
            sidebarProvider
        )
    );

    // 2. Command to open the File Manager in an Editor Tab
    const openCommand = vscode.commands.registerCommand('venel.filemanager.open', () => {
        FileManagerPanel.createOrShow(context.extensionUri);
    });
    context.subscriptions.push(openCommand);

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
        statusBarItem.tooltip = 'Click to open VenEl File Manager';
        statusBarItem.show();
        context.subscriptions.push(statusBarItem);
    }

    console.log('VenEl File Manager extension active and ready.');
}

export function deactivate() {
    if (statusBarItem) {
        statusBarItem.dispose();
    }
}
