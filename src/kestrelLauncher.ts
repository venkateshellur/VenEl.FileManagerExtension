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
    public static lastDiagnostic: string = 'Engine not yet initialized';

    public static get isRunning(): boolean {
        return this._process !== undefined && !this._process.killed;
    }

    public static async ensureRunning(): Promise<string | undefined> {
        // 1. If port 5050 is already live and answering on 127.0.0.1 or localhost, return immediately!
        if (await this.pingKestrel()) {
            return 'http://127.0.0.1:5050';
        }

        const config = vscode.workspace.getConfiguration('venel.filemanager');
        const autoStart = config.get<boolean>('autoStartKestrel', true);
        if (!autoStart) {
            this.lastDiagnostic = 'Auto-start Kestrel is disabled in settings (venel.filemanager.autoStartKestrel = false).';
            return undefined;
        }

        if (this._isStarting) {
            // Already an in-flight spin-up attempt; wait up to 3s for it
            for (let i = 0; i < 20; i++) {
                await new Promise((r) => setTimeout(r, 150));
                if (await this.pingKestrel()) {
                    return 'http://127.0.0.1:5050';
                }
            }
            return undefined;
        }

        this._isStarting = true;
        try {
            const dotnetPath = this.findDotnet();
            if (!dotnetPath) {
                this.lastDiagnostic = '.NET runtime (dotnet) was not found on PATH or standard system directories. Please ensure .NET 8 SDK or Runtime is installed.';
                this.log(`[VenEl] ${this.lastDiagnostic}`);
                return undefined;
            }

            const serverDll = await this.findServerDll(config.get<string>('kestrelServerPath'), dotnetPath);
            if (!serverDll) {
                this.lastDiagnostic = 'VenEl.MCP.Server binary was not found. Please clone and build VenEl.AssistantMCP, or configure "venel.filemanager.kestrelServerPath" in settings.';
                this.log(`[VenEl] ${this.lastDiagnostic}`);
                return undefined;
            }

            this.log(`Auto-starting backend engine in background: "${dotnetPath}" "${serverDll}"`);

            const isWin = process.platform === 'win32';
            const currentPath = process.env.PATH || process.env.Path || '';
            const extraPath = isWin
                ? ''
                : `${path.delimiter}/opt/homebrew/bin${path.delimiter}/usr/local/bin`;

            const envCopy: Record<string, string | undefined> = { ...process.env };
            if (isWin) {
                envCopy.Path = currentPath;
                envCopy.PATH = currentPath;
            } else {
                envCopy.PATH = `${currentPath}${extraPath}`;
            }
            envCopy.ASPNETCORE_ENVIRONMENT = 'Production';
            envCopy.ASPNETCORE_URLS = 'http://127.0.0.1:5050;http://localhost:5050';

            const proc = child_process.spawn(dotnetPath, [serverDll], {
                cwd: path.dirname(serverDll),
                env: envCopy as NodeJS.ProcessEnv,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            this._process = proc;
            proc.stdin?.on('error', () => {});

            proc.stdout?.on('data', (chunk) => {
                const text = chunk.toString();
                this.log(`[Engine STDOUT] ${text.trimEnd()}`);
            });

            proc.stderr?.on('data', (chunk) => {
                const text = chunk.toString();
                this.log(`[Engine STDERR] ${text.trimEnd()}`);
            });

            proc.on('error', (err) => {
                this.lastDiagnostic = `Backend process error: ${err.message}`;
                this.log(`[Engine Error] ${err.message}`);
                this._process = undefined;
            });

            proc.on('exit', (code, signal) => {
                this.lastDiagnostic = `Backend process exited (code=${code}, signal=${signal}).`;
                this.log(`[Engine Exited] code=${code}, signal=${signal}`);
                this._process = undefined;
            });

            // Poll for up to 12000ms until backend responds
            const startTime = Date.now();
            while (Date.now() - startTime < 12000) {
                await new Promise((r) => setTimeout(r, 200));
                if (await this.pingKestrel()) {
                    this.lastDiagnostic = 'Backend engine is online and healthy.';
                    this.log('Backend engine is successfully online and ready on http://127.0.0.1:5050');
                    return 'http://127.0.0.1:5050';
                }
            }

            this.lastDiagnostic = 'Backend engine did not respond to health check within 12s timeout.';
            this.log('Backend engine did not respond within timeout, falling back.');
            return undefined;
        } catch (e: any) {
            this.lastDiagnostic = `Failed to start backend engine: ${e?.message || e}`;
            this.log(this.lastDiagnostic);
            return undefined;
        } finally {
            this._isStarting = false;
        }
    }

    public static stop() {
        if (this._process && !this._process.killed) {
            this.log('Stopping background engine...');
            try {
                this._process.stdin?.end();
                this._process.kill('SIGTERM');
            } catch {}
            this._process = undefined;
        }
    }

    public static pingKestrel(): Promise<boolean> {
        return new Promise((resolve) => {
            const checkUrl = (targetUrl: string): Promise<boolean> => {
                return new Promise((resCheck) => {
                    try {
                        const req = http.get(`${targetUrl}/api/files/roots`, { timeout: 1200 }, (res) => {
                            res.resume();
                            const isKestrel = res.headers['x-engine'] === 'VenEl-Kestrel' || 
                                (res.headers['server'] && res.headers['server'].includes('Kestrel'));
                            resCheck(Boolean(res.statusCode && res.statusCode >= 200 && res.statusCode < 400 && isKestrel));
                        });
                        req.on('timeout', () => { req.destroy(); resCheck(false); });
                        req.on('error', () => resCheck(false));
                    } catch {
                        resCheck(false);
                    }
                });
            };

            // Test 127.0.0.1 first (bypasses Windows IPv6 resolution latency)
            checkUrl('http://127.0.0.1:5050').then((ok) => {
                if (ok) return resolve(true);
                checkUrl('http://localhost:5050').then(resolve);
            });
        });
    }

    public static findDotnet(): string | undefined {
        const isWin = process.platform === 'win32';
        const homedir = os.homedir();

        // 1. Direct candidates depending on OS
        const candidates: string[] = isWin
            ? [
                'C:\\Program Files\\dotnet\\dotnet.exe',
                'C:\\Program Files (x86)\\dotnet\\dotnet.exe',
                path.join(homedir, 'AppData', 'Local', 'Microsoft', 'dotnet', 'dotnet.exe'),
                path.join(homedir, '.dotnet', 'dotnet.exe'),
                path.join(process.env.ProgramFiles || 'C:\\Program Files', 'dotnet', 'dotnet.exe'),
                path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'dotnet', 'dotnet.exe')
            ]
            : [
                '/opt/homebrew/opt/dotnet@8/bin/dotnet',
                '/opt/homebrew/bin/dotnet',
                '/usr/local/share/dotnet/dotnet',
                path.join(homedir, '.dotnet', 'dotnet')
            ];

        for (const c of candidates) {
            try {
                if (c && fs.existsSync(c)) return c;
            } catch {}
        }

        // 2. Search PATH using platform-specific locator
        try {
            const lookupCmd = isWin ? 'where.exe dotnet' : 'which dotnet';
            const res = child_process.execSync(lookupCmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
            if (res) {
                const lines = res.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                for (const line of lines) {
                    if (fs.existsSync(line)) return line;
                }
            }
        } catch {}

        // 3. Fallback: test if bare 'dotnet' can execute directly
        try {
            child_process.execSync('dotnet --version', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
            return isWin ? 'dotnet.exe' : 'dotnet';
        } catch {}

        return undefined;
    }

    public static async findServerDll(configuredPath?: string, dotnetPath?: string): Promise<string | undefined> {
        if (configuredPath && configuredPath.trim()) {
            const p = configuredPath.trim();
            if (fs.existsSync(p)) return p;
        }

        const homedir = os.homedir();
        const candidates: string[] = [];

        // 1. Check open workspace folders first
        if (vscode.workspace.workspaceFolders) {
            for (const folder of vscode.workspace.workspaceFolders) {
                const root = folder.uri.fsPath;
                candidates.push(
                    path.join(root, 'src', 'VenEl.MCP.Server', 'bin', 'Debug', 'net8.0', 'VenEl.MCP.Server.dll'),
                    path.join(root, 'src', 'VenEl.MCP.Server', 'bin', 'Release', 'net8.0', 'VenEl.MCP.Server.dll'),
                    path.join(root, 'VenEl.MCPAssistant', 'src', 'VenEl.MCP.Server', 'bin', 'Debug', 'net8.0', 'VenEl.MCP.Server.dll'),
                    path.join(root, 'VenEl.MCPAssistant', 'src', 'VenEl.MCP.Server', 'bin', 'Release', 'net8.0', 'VenEl.MCP.Server.dll'),
                    path.join(root, 'VenEl.AssistantMCP', 'src', 'VenEl.MCP.Server', 'bin', 'Debug', 'net8.0', 'VenEl.MCP.Server.dll'),
                    path.join(root, 'VenEl.AssistantMCP', 'src', 'VenEl.MCP.Server', 'bin', 'Release', 'net8.0', 'VenEl.MCP.Server.dll'),
                    path.join(root, 'bin', 'Debug', 'net8.0', 'VenEl.MCP.Server.dll'),
                    path.join(root, 'bin', 'Release', 'net8.0', 'VenEl.MCP.Server.dll')
                );
            }
        }

        // 2. Common git / user directories across Windows and POSIX
        const subDirs = [
            ['Venky', 'Git', 'VenEl.MCPAssistant', 'VenEl.MCPAssistant'],
            ['Git', 'VenEl.MCPAssistant', 'VenEl.MCPAssistant'],
            ['Git', 'VenEl.MCPAssistant'],
            ['Git', 'VenEl.AssistantMCP'],
            ['source', 'repos', 'VenEl.MCPAssistant', 'VenEl.MCPAssistant'],
            ['source', 'repos', 'VenEl.AssistantMCP', 'VenEl.MCPAssistant'],
            ['source', 'repos', 'VenEl.AssistantMCP'],
            ['source', 'repos', 'VenEl.MCPAssistant'],
            ['Desktop', 'VenEl.MCPAssistant'],
            ['Desktop', 'VenEl.AssistantMCP'],
            ['Projects', 'VenEl.MCPAssistant'],
            ['Projects', 'VenEl.AssistantMCP'],
            ['VenEl.MCPAssistant'],
            ['VenEl.AssistantMCP']
        ];

        for (const sub of subDirs) {
            const base = path.join(homedir, ...sub);
            candidates.push(
                path.join(base, 'src', 'VenEl.MCP.Server', 'bin', 'Debug', 'net8.0', 'VenEl.MCP.Server.dll'),
                path.join(base, 'src', 'VenEl.MCP.Server', 'bin', 'Release', 'net8.0', 'VenEl.MCP.Server.dll'),
                path.join(base, 'bin', 'Debug', 'net8.0', 'VenEl.MCP.Server.dll')
            );
        }

        // 3. Fast direct check of candidates
        for (const c of candidates) {
            try {
                if (fs.existsSync(c)) return c;
            } catch {}
        }

        // 4. Use VS Code workspace file search to scan the workspace
        if (vscode.workspace.findFiles) {
            try {
                const found = await vscode.workspace.findFiles('**/VenEl.MCP.Server.dll', '**/node_modules/**', 1);
                if (found && found.length > 0 && fs.existsSync(found[0].fsPath)) {
                    return found[0].fsPath;
                }
            } catch {}
        }

        // 5. If DLL is not built yet, but csproj exists in the workspace, auto-build it!
        if (vscode.workspace.findFiles && dotnetPath) {
            try {
                const csprojFound = await vscode.workspace.findFiles('**/VenEl.MCP.Server.csproj', '**/node_modules/**', 1);
                if (csprojFound && csprojFound.length > 0) {
                    const csprojPath = csprojFound[0].fsPath;
                    this.log(`VenEl.MCP.Server.dll not found, but found project: ${csprojPath}. Auto-building...`);
                    try {
                        child_process.execSync(`"${dotnetPath}" build "${csprojPath}" -c Debug`, {
                            cwd: path.dirname(csprojPath),
                            encoding: 'utf8',
                            stdio: ['ignore', 'pipe', 'pipe']
                        });
                        const builtDll = path.join(path.dirname(csprojPath), 'bin', 'Debug', 'net8.0', 'VenEl.MCP.Server.dll');
                        if (fs.existsSync(builtDll)) {
                            this.log(`Successfully built backend engine: ${builtDll}`);
                            return builtDll;
                        }
                    } catch (bErr: any) {
                        this.log(`Auto-build failed: ${bErr?.message || bErr}`);
                    }
                }
            } catch {}
        }

        return undefined;
    }

    private static log(msg: string) {
        if (!this._outputChannel) {
            this._outputChannel = vscode.window.createOutputChannel('VenEl Engine');
        }
        this._outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] ${msg}`);
        console.log(`[VenEl Engine] ${msg}`);
    }
}
