import * as http from 'http';
import * as https from 'https';
import * as vscode from 'vscode';
import { LocalServer } from './localServer';

export class ServerManager {
    public static async getServerUrl(): Promise<string> {
        const config = vscode.workspace.getConfiguration('venel.filemanager');
        const configuredUrl = config.get<string>('serverUrl', '').replace(/\/+$/, '');

        // If the user explicitly provided a custom remote IP/URL, test it
        if (configuredUrl && configuredUrl !== 'http://localhost:5050') {
            const health = await this.pingUrl(configuredUrl);
            if (health.online) {
                return configuredUrl;
            }
        }

        // Otherwise, check if localhost:5050 is active and responding to /api/files/roots with 200 OK
        const local5050Health = await this.pingUrl('http://localhost:5050');
        if (local5050Health.online) {
            return 'http://localhost:5050';
        }

        // If not running or returned 404, start and use our built-in engine!
        return await LocalServer.ensureRunning();
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

    private static pingUrl(urlStr: string): Promise<{ online: boolean; message: string }> {
        return new Promise((resolve) => {
            try {
                const url = new URL(urlStr + '/api/files/roots');
                const client = url.protocol === 'https:' ? https : http;
                const req = client.get(url, { timeout: 2500 }, (res) => {
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
