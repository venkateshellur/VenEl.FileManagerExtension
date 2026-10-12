import * as http from 'http';
import * as https from 'https';
import * as vscode from 'vscode';

export class ServerManager {
    public static getServerUrl(): string {
        const config = vscode.workspace.getConfiguration('venel.filemanager');
        return config.get<string>('serverUrl', 'http://localhost:5050').replace(/\/+$/, '');
    }

    public static async checkHealth(): Promise<{ online: boolean; message: string }> {
        const urlStr = this.getServerUrl();
        return new Promise((resolve) => {
            try {
                const url = new URL(urlStr + '/api/files/roots');
                const client = url.protocol === 'https:' ? https : http;
                const req = client.get(url, { timeout: 4000 }, (res) => {
                    res.resume();
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
                        resolve({ online: true, message: `Connected to VenEl engine at ${urlStr}` });
                    } else {
                        resolve({ online: false, message: `Server responded with HTTP ${res.statusCode}` });
                    }
                });

                req.on('timeout', () => {
                    req.destroy();
                    resolve({ online: false, message: `Connection timed out at ${urlStr}` });
                });

                req.on('error', (err) => {
                    resolve({ online: false, message: `Could not connect to ${urlStr} (${err.message})` });
                });
            } catch (err: any) {
                resolve({ online: false, message: `Invalid server URL: ${err.message}` });
            }
        });
    }
}
