import * as child_process from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { Logger } from './logger';

export class KestrelLauncher {
    private static _process: child_process.ChildProcess | undefined;
    private static _outputChannel: vscode.OutputChannel | undefined;
    private static _extensionPath: string | undefined;
    private static _isStarting = false;
    private static _isProvisioning = false;
    public static lastDiagnostic: string = 'Engine not yet initialized';
    public static engineState: 'KESTREL_HOST' | 'KESTREL_ACQUIRED' | 'NODE_SAFE_MODE' | 'NODE_ACQUIRING' = 'NODE_SAFE_MODE';

    public static init(context: vscode.ExtensionContext) {
        this._extensionPath = context.extensionPath;
    }

    public static get isRunning(): boolean {
        return this._process !== undefined && !this._process.killed;
    }

    public static async ensureRunning(forceForeground: boolean = false): Promise<string | undefined> {
        // 1. If port 5050 is already live and answering on 127.0.0.1 or localhost, return immediately!
        if (await this.pingKestrel()) {
            this.engineState = 'KESTREL_HOST';
            return 'http://127.0.0.1:5050';
        }

        const config = vscode.workspace.getConfiguration('venel.filemanager');
        const autoStart = config.get<boolean>('autoStartKestrel', true);
        if (!autoStart) {
            this.lastDiagnostic = 'Auto-start Kestrel is disabled in settings (venel.filemanager.autoStartKestrel = false).';
            this.engineState = 'NODE_SAFE_MODE';
            return undefined;
        }

        if (this._isStarting) {
            // Already an in-flight spin-up attempt; wait up to 3s for it
            for (let i = 0; i < 20; i++) {
                await new Promise((r) => setTimeout(r, 150));
                if (await this.pingKestrel()) {
                    this.engineState = 'KESTREL_HOST';
                    return 'http://127.0.0.1:5050';
                }
            }
            return undefined;
        }

        this._isStarting = true;
        try {
            let dotnetPath = this.findDotnet();
            if (!dotnetPath) {
                if (forceForeground) {
                    this.log('[VenEl] Foreground re-check: provisioning .NET runtime...');
                    dotnetPath = await this.autoProvisionDotnet(true);
                } else {
                    this.log('[VenEl] .NET not found on host. Launching background acquisition; using Safe Mode (Node.js)...');
                    this.engineState = 'NODE_ACQUIRING';
                    this.autoProvisionDotnetBackground();
                    this.lastDiagnostic = '.NET 8+ runtime not yet available. Zero-dependency Safe Mode (Node.js) is active.';
                    return undefined;
                }
            }
            if (!dotnetPath) {
                this.lastDiagnostic = '.NET runtime (dotnet) was not found and could not be provisioned.';
                this.engineState = 'NODE_SAFE_MODE';
                this.log(`[VenEl] ${this.lastDiagnostic}`);
                return undefined;
            }

            this.engineState = 'KESTREL_HOST';
            const serverDll = await this.findServerDll(config.get<string>('kestrelServerPath'), dotnetPath);
            if (!serverDll) {
                this.lastDiagnostic = 'VenEl backend engine binary was not found. Please reinstall the extension or configure "venel.filemanager.kestrelServerPath" in settings.';
                this.log(`[VenEl] ${this.lastDiagnostic}`);
                return undefined;
            }

            this.log(`Auto-starting backend engine in background: "${dotnetPath}" --roll-forward LatestMajor "${serverDll}"`);

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
            envCopy.VENEL_EXTENSION_VERSION = '1.3.0';

            const proc = child_process.spawn(dotnetPath, ['--roll-forward', 'LatestMajor', serverDll], {
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

            // Poll for up to 8000ms until backend responds
            const startTime = Date.now();
            while (Date.now() - startTime < 8000) {
                await new Promise((r) => setTimeout(r, 150));
                if (await this.pingKestrel()) {
                    this.lastDiagnostic = 'Backend engine is online and healthy.';
                    this.log('Backend engine is successfully online and ready on http://127.0.0.1:5050');
                    return 'http://127.0.0.1:5050';
                }
            }

            this.lastDiagnostic = 'Backend engine did not respond to health check within 8s timeout.';
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
        const candidates: (string | undefined)[] = isWin
            ? [
                'C:\\Program Files\\dotnet\\dotnet.exe',
                'C:\\Program Files (x86)\\dotnet\\dotnet.exe',
                path.join(homedir, 'AppData', 'Local', 'Microsoft', 'dotnet', 'dotnet.exe'),
                path.join(homedir, '.dotnet', 'dotnet.exe'),
                process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Microsoft', 'dotnet', 'dotnet.exe') : undefined,
                process.env.DOTNET_ROOT ? path.join(process.env.DOTNET_ROOT, 'dotnet.exe') : undefined,
                process.env['DOTNET_ROOT(x86)'] ? path.join(process.env['DOTNET_ROOT(x86)'], 'dotnet.exe') : undefined,
                process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'dotnet', 'dotnet.exe') : undefined,
                process.env['ProgramFiles(x86)'] ? path.join(process.env['ProgramFiles(x86)'], 'dotnet', 'dotnet.exe') : undefined,
                'C:\\ProgramData\\chocolatey\\bin\\dotnet.exe',
                path.join(homedir, 'scoop', 'apps', 'dotnet-sdk', 'current', 'dotnet.exe'),
                path.join(homedir, 'scoop', 'shims', 'dotnet.exe')
            ]
            : [
                '/opt/homebrew/opt/dotnet@8/bin/dotnet',
                '/opt/homebrew/bin/dotnet',
                '/usr/local/share/dotnet/dotnet',
                '/usr/share/dotnet/dotnet',
                '/usr/bin/dotnet',
                path.join(homedir, '.dotnet', 'dotnet'),
                process.env.DOTNET_ROOT ? path.join(process.env.DOTNET_ROOT, 'dotnet') : undefined
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
        // 0. If user configured custom path that exists, prioritize it
        if (configuredPath && configuredPath.trim()) {
            const p = configuredPath.trim();
            if (fs.existsSync(p)) return p;
        }

        // 1. Check bundled server in extension directory (0-config for installed users!)
        const bundledCandidates: (string | undefined)[] = [
            this._extensionPath ? path.join(this._extensionPath, 'server', 'VenEl.MCP.FileManager.Host.dll') : undefined,
            this._extensionPath ? path.join(this._extensionPath, 'server', 'VenEl.MCP.Server.dll') : undefined,
            path.join(__dirname, '..', 'server', 'VenEl.MCP.FileManager.Host.dll'),
            path.join(__dirname, '..', 'server', 'VenEl.MCP.Server.dll'),
            path.resolve(__dirname, '..', 'server', 'VenEl.MCP.FileManager.Host.dll'),
            path.resolve(__dirname, '..', 'server', 'VenEl.MCP.Server.dll')
        ];

        for (const b of bundledCandidates) {
            try {
                if (b && fs.existsSync(b)) {
                    this.log(`Using bundled backend engine: ${b}`);
                    return b;
                }
            } catch {}
        }

        const homedir = os.homedir();
        const candidates: string[] = [];

        // 2. Check open workspace folders (for local development)
        if (vscode.workspace.workspaceFolders) {
            for (const folder of vscode.workspace.workspaceFolders) {
                const root = folder.uri.fsPath;
                candidates.push(
                    path.join(root, 'server', 'VenEl.MCP.FileManager.Host.dll'),
                    path.join(root, 'src', 'VenEl.MCP.FileManager.Host', 'bin', 'Debug', 'net8.0', 'VenEl.MCP.FileManager.Host.dll'),
                    path.join(root, 'src', 'VenEl.MCP.FileManager.Host', 'bin', 'Release', 'net8.0', 'VenEl.MCP.FileManager.Host.dll'),
                    path.join(root, 'src', 'VenEl.MCP.Server', 'bin', 'Debug', 'net8.0', 'VenEl.MCP.Server.dll'),
                    path.join(root, 'src', 'VenEl.MCP.Server', 'bin', 'Release', 'net8.0', 'VenEl.MCP.Server.dll'),
                    path.join(root, 'VenEl.MCPAssistant', 'src', 'VenEl.MCP.FileManager.Host', 'bin', 'Debug', 'net8.0', 'VenEl.MCP.FileManager.Host.dll'),
                    path.join(root, 'VenEl.MCPAssistant', 'src', 'VenEl.MCP.FileManager.Host', 'bin', 'Release', 'net8.0', 'VenEl.MCP.FileManager.Host.dll'),
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

    public static autoProvisionDotnetBackground(): void {
        if (this._isProvisioning) return;
        setTimeout(async () => {
            try {
                this.log('[VenEl] Starting background portable .NET acquisition (Approach C)...');
                const exe = await this.autoProvisionDotnet(false);
                if (exe) {
                    this.engineState = 'KESTREL_ACQUIRED';
                    this.log(`[VenEl] Background acquisition successful: ${exe}`);
                    vscode.window.showInformationMessage(
                        '⚡ VenEl File Manager: High-performance .NET engine is now ready!',
                        'Switch Engine'
                    ).then((choice) => {
                        if (choice === 'Switch Engine') {
                            vscode.commands.executeCommand('venel.filemanager.open');
                        }
                    });
                } else {
                    this.engineState = 'NODE_SAFE_MODE';
                }
            } catch (err: any) {
                this.engineState = 'NODE_SAFE_MODE';
                this.lastDiagnostic = `Background .NET acquisition could not complete (${err?.message || err}). Safe Mode (Node.js) remains active.`;
                this.log(`[VenEl] ${this.lastDiagnostic}`);
            }
        }, 800);
    }

    public static async autoProvisionDotnet(showProgress: boolean = true): Promise<string | undefined> {
        if (this._isProvisioning) {
            for (let i = 0; i < 90; i++) {
                await new Promise((r) => setTimeout(r, 500));
                const found = this.findDotnet();
                if (found) return found;
            }
            return undefined;
        }

        this._isProvisioning = true;
        const isWin = process.platform === 'win32';
        const homedir = os.homedir();
        const dotnetDir = path.join(homedir, '.dotnet');
        const expectedExe = path.join(dotnetDir, isWin ? 'dotnet.exe' : 'dotnet');

        const performInstall = async (reporter?: { report: (val: { increment?: number; message?: string }) => void }) => {
            reporter?.report({ increment: 10, message: 'Downloading official installer...' });
            this.log('[VenEl] Auto-provisioning .NET 8 runtime into ' + dotnetDir);

            if (!fs.existsSync(dotnetDir)) {
                fs.mkdirSync(dotnetDir, { recursive: true });
            }

            if (!isWin) {
                const scriptPath = path.join(os.tmpdir(), `dotnet-install-${Date.now()}.sh`);
                try {
                    await this.downloadFile('https://dot.net/v1/dotnet-install.sh', scriptPath);
                    fs.chmodSync(scriptPath, 0o755);

                    reporter?.report({ increment: 30, message: 'Installing ASP.NET Core 8.0 runtime...' });
                    this.log(`[VenEl] Executing: bash "${scriptPath}" --channel 8.0 --runtime aspnetcore --install-dir "${dotnetDir}" --no-path`);

                    await new Promise<void>((resolve, reject) => {
                        const proc = child_process.spawn('bash', [
                            scriptPath,
                            '--channel', '8.0',
                            '--runtime', 'aspnetcore',
                            '--install-dir', dotnetDir,
                            '--no-path'
                        ], { stdio: ['ignore', 'pipe', 'pipe'] });

                        proc.stdout?.on('data', (d) => this.log(`[dotnet-install] ${d.toString().trim()}`));
                        proc.stderr?.on('data', (d) => this.log(`[dotnet-install err] ${d.toString().trim()}`));
                        proc.on('close', (code) => {
                            if (code === 0) resolve();
                            else reject(new Error(`Installer exited with code ${code}`));
                        });
                        proc.on('error', reject);
                    });
                } finally {
                    try { if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath); } catch {}
                }
            } else {
                reporter?.report({ increment: 30, message: 'Installing ASP.NET Core 8.0 runtime...' });
                const psCmd = `&([scriptblock]::Create((Invoke-WebRequest -UseBasicParsing 'https://dot.net/v1/dotnet-install.ps1'))) -Channel 8.0 -Runtime aspnetcore -InstallDir '${dotnetDir}' -NoPath`;
                await new Promise<void>((resolve, reject) => {
                    const proc = child_process.spawn('powershell.exe', [
                        '-NoProfile',
                        '-ExecutionPolicy', 'Bypass',
                        '-Command', psCmd
                    ], { stdio: ['ignore', 'pipe', 'pipe'] });

                    proc.stdout?.on('data', (d) => this.log(`[dotnet-install] ${d.toString().trim()}`));
                    proc.stderr?.on('data', (d) => this.log(`[dotnet-install err] ${d.toString().trim()}`));
                    proc.on('close', (code) => {
                        if (code === 0) resolve();
                        else reject(new Error(`PowerShell installer exited with code ${code}`));
                    });
                    proc.on('error', reject);
                });
            }

            reporter?.report({ increment: 50, message: 'Verifying installation...' });

            if (!isWin && fs.existsSync(expectedExe)) {
                try { fs.chmodSync(expectedExe, 0o755); } catch {}
            }

            if (fs.existsSync(expectedExe)) {
                this.log(`[VenEl] .NET 8 runtime successfully provisioned at: ${expectedExe}`);
                if (showProgress) {
                    vscode.window.showInformationMessage('⚡ VenEl File Manager: .NET 8 engine installed successfully! High-performance indexing and SFTP are now active.');
                }
                return expectedExe;
            }

            const checkAfter = this.findDotnet();
            if (checkAfter) return checkAfter;

            throw new Error('Installed binary not found at ' + expectedExe);
        };

        try {
            if (showProgress) {
                return await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: 'VenEl File Manager: Provisioning .NET 8 runtime for high-performance engine & SFTP...',
                        cancellable: false
                    },
                    performInstall
                );
            } else {
                return await performInstall();
            }
        } catch (err: any) {
            this.lastDiagnostic = `Could not auto-install .NET 8: ${err?.message || err}`;
            this.log(`[VenEl] ${this.lastDiagnostic}`);
            if (showProgress) {
                vscode.window.showWarningMessage(
                    'VenEl File Manager: Automatic .NET 8 setup encountered an issue. Basic file browsing is active via Node.js engine.',
                    'View Help'
                ).then((action) => {
                    if (action === 'View Help') {
                        vscode.env.openExternal(vscode.Uri.parse('https://dotnet.microsoft.com/download/dotnet/8.0'));
                    }
                });
            }
            return undefined;
        } finally {
            this._isProvisioning = false;
        }
    }

    private static downloadFile(urlStr: string, destPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const follow = (curUrl: string, depth: number) => {
                if (depth > 5) return reject(new Error('Too many redirects downloading installer'));
                try {
                    const u = new URL(curUrl);
                    const client = u.protocol === 'https:' ? https : http;
                    const req = client.get(curUrl, { timeout: 15000 }, (res) => {
                        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                            res.resume();
                            const nextUrl = new URL(res.headers.location, curUrl).toString();
                            return follow(nextUrl, depth + 1);
                        }
                        if (res.statusCode !== 200) {
                            res.resume();
                            return reject(new Error(`Failed to download ${curUrl}: HTTP ${res.statusCode}`));
                        }
                        const fileStream = fs.createWriteStream(destPath);
                        res.pipe(fileStream);
                        fileStream.on('finish', () => fileStream.close(() => resolve()));
                        fileStream.on('error', (err) => {
                            fs.unlink(destPath, () => {});
                            reject(err);
                        });
                    });
                    req.on('timeout', () => { req.destroy(); reject(new Error('Download timed out')); });
                    req.on('error', reject);
                } catch (e) {
                    reject(e);
                }
            };
            follow(urlStr, 0);
        });
    }

    private static log(msg: string) {
        if (/error|failed|crash|exit/i.test(msg)) {
            Logger.error(msg);
        } else if (/warn/i.test(msg)) {
            Logger.warn(msg);
        } else {
            Logger.info(msg);
        }
    }
}
