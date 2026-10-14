import * as child_process from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

export class KestrelLauncher {
    private static _process: child_process.ChildProcess | undefined;
    private static _outputChannel: vscode.OutputChannel | undefined;
    private static _isStarting = false;

    public static get isRunning(): boolean {
        return this._process !== undefined && !this._process.killed;
    }

    public static async ensureRunning(): Promise<string | undefined> {
        // 1. If port 5050 is already live and answering, return immediately!
        if (await this.pingKestrel()) {
            return 'http://localhost:5050';
        }

        const config = vscode.workspace.getConfiguration('venel.filemanager');
        const autoStart = config.get<boolean>('autoStartKestrel', true);
        if (!autoStart) {
            return undefined;
        }

        if (this._isStarting) {
            // Already an in-flight spin-up attempt; wait up to 3s for it
            for (let i = 0; i < 20; i++) {
                await new Promise((r) => setTimeout(r, 150));
                if (await this.pingKestrel()) {
                    return 'http://localhost:5050';
                }
            }
            return undefined;
        }

        this._isStarting = true;
        try {
            const dotnetPath = this.findDotnet();
            if (!dotnetPath) {
                console.log('[VenEl] dotnet executable not found on system.');
                return undefined;
            }

            const serverDll = this.findServerDll(config.get<string>('kestrelServerPath'));
            if (!serverDll) {
                console.log('[VenEl] VenEl.MCP.Server binary not found.');
                return undefined;
            }

            this.log(`Auto-starting Kestrel server in background: ${dotnetPath} "${serverDll}"`);

            const proc = child_process.spawn(dotnetPath, [serverDll], {
                cwd: path.dirname(serverDll),
                env: {
                    ...process.env,
                    ASPNETCORE_ENVIRONMENT: 'Production'
                },
                stdio: ['ignore', 'pipe', 'pipe']
            });

            this._process = proc;

            proc.stdout?.on('data', (chunk) => {
                const text = chunk.toString();
                this.log(`[Kestrel STDOUT] ${text.trimEnd()}`);
            });

            proc.stderr?.on('data', (chunk) => {
                const text = chunk.toString();
                this.log(`[Kestrel STDERR] ${text.trimEnd()}`);
            });

            proc.on('error', (err) => {
                this.log(`[Kestrel Error] ${err.message}`);
                this._process = undefined;
            });

            proc.on('exit', (code, signal) => {
                this.log(`[Kestrel Exited] code=${code}, signal=${signal}`);
                this._process = undefined;
            });

            // Poll for up to 3500ms until Kestrel responds to /api/files/roots
            const startTime = Date.now();
            while (Date.now() - startTime < 3500) {
                await new Promise((r) => setTimeout(r, 150));
                if (await this.pingKestrel()) {
                    this.log('Kestrel server is successfully online and ready on http://localhost:5050');
                    return 'http://localhost:5050';
                }
            }

            this.log('Kestrel server did not respond within timeout, falling back.');
            return undefined;
        } catch (e: any) {
            this.log(`Failed to start Kestrel server: ${e?.message || e}`);
            return undefined;
        } finally {
            this._isStarting = false;
        }
    }

    public static stop() {
        if (this._process && !this._process.killed) {
            this.log('Stopping background Kestrel server...');
            try {
                this._process.kill('SIGTERM');
            } catch {}
            this._process = undefined;
        }
    }

    public static pingKestrel(): Promise<boolean> {
        return new Promise((resolve) => {
            try {
                const req = http.get('http://localhost:5050/api/files/roots', { timeout: 800 }, (res) => {
                    res.resume();
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
                        resolve(true);
                    } else {
                        resolve(false);
                    }
                });
                req.on('timeout', () => {
                    req.destroy();
                    resolve(false);
                });
                req.on('error', () => resolve(false));
            } catch {
                resolve(false);
            }
        });
    }

    private static findDotnet(): string | undefined {
        const homedir = os.homedir();
        const candidates = [
            'dotnet',
            '/opt/homebrew/opt/dotnet@8/bin/dotnet',
            '/opt/homebrew/bin/dotnet',
            '/usr/local/share/dotnet/dotnet',
            path.join(homedir, '.dotnet', 'dotnet'),
            'C:\\Program Files\\dotnet\\dotnet.exe'
        ];

        for (const c of candidates) {
            try {
                if (c.includes('/') || c.includes('\\')) {
                    if (fs.existsSync(c)) return c;
                } else {
                    const res = child_process.execSync(`which ${c}`, { encoding: 'utf8' }).trim();
                    if (res && fs.existsSync(res)) return res;
                }
            } catch {}
        }
        return undefined;
    }

    private static findServerDll(configuredPath?: string): string | undefined {
        if (configuredPath && configuredPath.trim()) {
            const p = configuredPath.trim();
            if (fs.existsSync(p)) return p;
        }

        const homedir = os.homedir();
        const candidates = [
            path.join(homedir, 'Venky/Git/VenEl.MCPAssistant/VenEl.MCPAssistant/src/VenEl.MCP.Server/bin/Debug/net8.0/VenEl.MCP.Server.dll'),
            path.join(homedir, 'Venky/Git/VenEl.MCPAssistant/VenEl.MCPAssistant/src/VenEl.MCP.Server/bin/Release/net8.0/VenEl.MCP.Server.dll'),
            path.join(homedir, 'Git/VenEl.MCPAssistant/VenEl.MCPAssistant/src/VenEl.MCP.Server/bin/Debug/net8.0/VenEl.MCP.Server.dll'),
            path.join(homedir, 'Git/VenEl.MCPAssistant/VenEl.MCPAssistant/src/VenEl.MCP.Server/bin/Release/net8.0/VenEl.MCP.Server.dll'),
            path.join(homedir, 'VenEl.MCPAssistant/src/VenEl.MCP.Server/bin/Debug/net8.0/VenEl.MCP.Server.dll')
        ];

        // Also check any currently open workspace folders
        if (vscode.workspace.workspaceFolders) {
            for (const folder of vscode.workspace.workspaceFolders) {
                candidates.unshift(
                    path.join(folder.uri.fsPath, 'src/VenEl.MCP.Server/bin/Debug/net8.0/VenEl.MCP.Server.dll'),
                    path.join(folder.uri.fsPath, 'src/VenEl.MCP.Server/bin/Release/net8.0/VenEl.MCP.Server.dll'),
                    path.join(folder.uri.fsPath, 'VenEl.MCPAssistant/src/VenEl.MCP.Server/bin/Debug/net8.0/VenEl.MCP.Server.dll')
                );
            }
        }

        for (const c of candidates) {
            if (fs.existsSync(c)) return c;
        }
        return undefined;
    }

    private static log(msg: string) {
        if (!this._outputChannel) {
            this._outputChannel = vscode.window.createOutputChannel('VenEl Kestrel Server');
        }
        this._outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] ${msg}`);
        console.log(`[VenEl Kestrel] ${msg}`);
    }
}
