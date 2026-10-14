import * as http from 'http';
import * as https from 'https';
import * as vscode from 'vscode';
import { LocalServer } from './localServer';
import { KestrelLauncher } from './kestrelLauncher';

export class ServerManager {
    private static _activeServerUrl: string | undefined;

    public static async getServerUrl(): Promise<string> {
        if (this._activeServerUrl) {
            return this._activeServerUrl;
        }

        const config = vscode.workspace.getConfiguration('venel.filemanager');
        const configuredUrl = config.get<string>('serverUrl', '').replace(/\/+$/, '');

        // 1. If user explicitly provided a custom remote IP/URL, test it
        if (configuredUrl && configuredUrl !== 'http://localhost:5050') {
            const health = await this.pingUrl(configuredUrl);
            if (health.online) {
                this._activeServerUrl = configuredUrl;
                return configuredUrl;
            }
        }

        // 2. Check if .NET Kestrel on localhost:5050 is already alive, or try to auto-start it
        const kestrelUrl = await KestrelLauncher.ensureRunning();
        if (kestrelUrl) {
            this._activeServerUrl = kestrelUrl;
            return kestrelUrl;
        }

        // 3. Fallback to embedded Node engine (spins up in ~50ms with zero dependencies)
        const nodeUrl = await LocalServer.ensureRunning();
        this._activeServerUrl = nodeUrl;
        return nodeUrl;
    }

    public static async checkHealth(): Promise<{ online: boolean; message: string; url: string }> {
        const activeUrl = await this.getServerUrl();
        const health = await this.pingUrl(activeUrl);
        return {
            online: health.online,
            message: health.message,
            url: activeUrl
        };
    }

    public static pingUrl(urlStr: string): Promise<{ online: boolean; message: string }> {
        return new Promise((resolve) => {
            try {
                const url = new URL(urlStr + '/api/files/roots');
                const client = url.protocol === 'https:' ? https : http;
                const req = client.get(url, { timeout: 1000 }, (res) => {
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
