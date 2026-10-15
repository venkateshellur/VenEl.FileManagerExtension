import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { exec } from 'child_process';

export class LocalServer {
    private static _server: http.Server | undefined;
    private static _serverUrl: string | undefined;

    public static get serverUrl(): string | undefined {
        return this._serverUrl;
    }

    public static async ensureRunning(): Promise<string> {
        if (this._serverUrl) {
            return this._serverUrl;
        }

        const preferredPort = 5050;
        const port = await this.findAvailablePort(preferredPort);
        
        await this.startServer(port);
        this._serverUrl = `http://localhost:${port}`;
        try { this.getSystemRoots(); } catch {}
        console.log(`[VenEl] Built-in local engine active and pre-warmed at ${this._serverUrl}`);
        return this._serverUrl;
    }

    private static findAvailablePort(startPort: number): Promise<number> {
        return new Promise((resolve) => {
            const testServer = http.createServer();
            testServer.listen(startPort, '127.0.0.1', () => {
                const port = (testServer.address() as any).port;
                testServer.close(() => resolve(port));
            });
            testServer.on('error', () => {
                resolve(this.findAvailablePort(startPort === 5050 ? 5055 : startPort + 1));
            });
        });
    }

    private static parseJsonBody(req: http.IncomingMessage): Promise<any> {
        return new Promise((resolve) => {
            let data = '';
            req.on('data', chunk => { data += chunk; });
            req.on('end', () => {
                try {
                    resolve(data ? JSON.parse(data) : {});
                } catch {
                    resolve({});
                }
            });
            req.on('error', () => resolve({}));
        });
    }

    private static startServer(port: number): Promise<void> {
        return new Promise((resolve, reject) => {
            const server = http.createServer(async (req, res) => {
                try {
                    res.setHeader('Access-Control-Allow-Origin', '*');
                    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
                    res.setHeader('Access-Control-Allow-Headers', '*');

                    if (req.method === 'OPTIONS') {
                        res.writeHead(204);
                        res.end();
                        return;
                    }

                    const reqUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
                    const pathname = reqUrl.pathname;

                    // 1. Dashboard UI
                    if (pathname === '/' || pathname === '/index.html') {
                        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                        res.end(LocalServer.getIndexHtml());
                        return;
                    }

                    // 2. System Roots / Drives
                    if (pathname === '/api/files/roots') {
                        const roots = LocalServer.getSystemRoots();
                        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                        res.end(JSON.stringify(roots));
                        return;
                    }

                                        // 2b. Agent Machine-Level Search (Spotlight on macOS / PowerShell on Windows)
                    if (pathname === '/api/files/agentSearch') {
                        const query = reqUrl.searchParams.get('query') || '';
                        const scope = reqUrl.searchParams.get('scope') || 'machine';
                        const currentPath = reqUrl.searchParams.get('currentPath') || os.homedir();
                        const maxResults = Math.min(parseInt(reqUrl.searchParams.get('maxResults') || '80', 10), 150);

                        if (!query.trim()) {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'Query is required' }));
                            return;
                        }

                        const t0 = Date.now();
                        const results = await LocalServer.performAgentSearch(query.trim(), scope, currentPath, maxResults);
                        const executionTimeMs = Date.now() - t0;

                        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                        res.end(JSON.stringify({
                            query: query.trim(),
                            scope,
                            executionTimeMs,
                            engine: results.engine,
                            count: results.items.length,
                            items: results.items
                        }));
                        return;
                    }

                    // 3. Directory Listing
                    if (pathname === '/api/files/list') {
                        let targetPath = reqUrl.searchParams.get('path');
                        if (!targetPath || targetPath === '.') {
                            targetPath = os.homedir();
                        }
                        targetPath = path.resolve(targetPath);

                        if (!fs.existsSync(targetPath)) {
                            res.writeHead(404, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'Directory not found' }));
                            return;
                        }

                        const entries = await fs.promises.readdir(targetPath, { withFileTypes: true });
                        const items: any[] = [];
                        for (const entry of entries) {
                            if (entry.name.startsWith('.')) continue;
                            const isDir = entry.isDirectory();
                            let size = 0;
                            let modified = '';
                            try {
                                const stat = await fs.promises.stat(path.join(targetPath, entry.name));
                                size = isDir ? 0 : stat.size;
                                modified = stat.mtime.toISOString();
                            } catch {}

                            items.push({
                                name: entry.name,
                                type: isDir ? 'Directory' : 'File',
                                size: size,
                                modified: modified
                            });
                        }

                        items.sort((a, b) => {
                            if (a.type === b.type) return a.name.localeCompare(b.name);
                            return a.type === 'Directory' ? -1 : 1;
                        });

                        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                        res.end(JSON.stringify({ currentPath: targetPath, items: items }));
                        return;
                    }

                    // 4. File Read
                    if (pathname === '/api/files/read') {
                        const targetPath = reqUrl.searchParams.get('path');
                        if (!targetPath || !fs.existsSync(targetPath)) {
                            res.writeHead(404, { 'Content-Type': 'text/plain' });
                            res.end('File not found');
                            return;
                        }
                        const content = await fs.promises.readFile(targetPath, 'utf8');
                        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
                        res.end(content);
                        return;
                    }

                    // 5. Raw File (Images / Media)
                    if (pathname === '/api/files/raw') {
                        const targetPath = reqUrl.searchParams.get('path');
                        if (!targetPath || !fs.existsSync(targetPath)) {
                            res.writeHead(404, { 'Content-Type': 'text/plain' });
                            res.end('File not found');
                            return;
                        }
                        const ext = path.extname(targetPath).toLowerCase();
                        const mimeMap: Record<string, string> = {
                            '.png': 'image/png',
                            '.jpg': 'image/jpeg',
                            '.jpeg': 'image/jpeg',
                            '.gif': 'image/gif',
                            '.svg': 'image/svg+xml',
                            '.webp': 'image/webp'
                        };
                        res.writeHead(200, { 'Content-Type': mimeMap[ext] || 'application/octet-stream' });
                        fs.createReadStream(targetPath).pipe(res);
                        return;
                    }

                    // 6. Open File in VS Code Editor
                    if (pathname === '/api/files/openInEditor') {
                        const targetPath = reqUrl.searchParams.get('path');
                        if (targetPath && fs.existsSync(targetPath)) {
                            vscode.commands.executeCommand('vscode.open', vscode.Uri.file(targetPath));
                        }
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ ok: true }));
                        return;
                    }

                    // 6b. Open Folder/File in VS Code Integrated Terminal
                    if (pathname === '/api/files/openInTerminal') {
                        const targetPath = reqUrl.searchParams.get('path');
                        if (targetPath && fs.existsSync(targetPath)) {
                            let dir = targetPath;
                            try {
                                const stat = await fs.promises.stat(targetPath);
                                if (!stat.isDirectory()) {
                                    dir = path.dirname(targetPath);
                                }
                            } catch {}
                            const terminal = vscode.window.createTerminal({
                                name: `VenEl: ${path.basename(dir) || 'Terminal'}`,
                                cwd: dir
                            });
                            terminal.show();
                        }
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ ok: true }));
                        return;
                    }

                    // 6c. Open VS Code Settings
                    if (pathname === '/api/files/openSettings') {
                        vscode.commands.executeCommand('workbench.action.openSettings', 'venel.filemanager');
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ ok: true }));
                        return;
                    }

                    // 6d. Toggle Primary Sidebar Visibility
                    if (pathname === '/api/files/toggleSidebar') {
                        vscode.commands.executeCommand('workbench.action.toggleSidebarVisibility');
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ ok: true }));
                        return;
                    }

                    // 6e. Reveal File/Folder in OS (Finder / File Explorer)
                    if (pathname === '/api/files/revealInOS') {
                        const targetPath = reqUrl.searchParams.get('path');
                        if (targetPath && fs.existsSync(targetPath)) {
                            vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(targetPath));
                        }
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ ok: true }));
                        return;
                    }

                    // 6f. Git Status Query
                    if (pathname === '/api/files/gitStatus') {
                        const targetPath = reqUrl.searchParams.get('path') || process.cwd();
                        const gitInfo = await LocalServer.getGitStatus(targetPath);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify(gitInfo));
                        return;
                    }

                    // 6g. Git Diff With HEAD in VS Code
                    if (pathname === '/api/files/diffWithHead') {
                        const targetPath = reqUrl.searchParams.get('path');
                        if (targetPath && fs.existsSync(targetPath)) {
                            const fileUri = vscode.Uri.file(targetPath);
                            let opened = false;
                            try {
                                await vscode.commands.executeCommand('git.openChange', fileUri);
                                opened = true;
                            } catch {}
                            if (!opened) {
                                try {
                                    const dir = path.dirname(targetPath);
                                    const relPath = await new Promise<string>((resolve, reject) => {
                                        exec(`git ls-files --full-name "${path.basename(targetPath)}"`, { cwd: dir }, (err, stdout) => {
                                            if (err || !stdout.trim()) reject(new Error('File not tracked in git'));
                                            else resolve(stdout.trim());
                                        });
                                    });
                                    const headContent = await new Promise<string>((resolve, reject) => {
                                        exec(`git show HEAD:"${relPath}"`, { cwd: dir }, (err, stdout) => {
                                            if (err) reject(err); else resolve(stdout);
                                        });
                                    });
                                    const tempDir = os.tmpdir();
                                    const tempHeadPath = path.join(tempDir, `HEAD_${path.basename(targetPath)}`);
                                    await fs.promises.writeFile(tempHeadPath, headContent, 'utf8');
                                    const headUri = vscode.Uri.file(tempHeadPath);
                                    await vscode.commands.executeCommand('vscode.diff', headUri, fileUri, `${path.basename(targetPath)} (HEAD ↔ Working Tree)`);
                                } catch (err: any) {
                                    vscode.window.showErrorMessage(`Could not open diff: ${err.message}`);
                                }
                            }
                        }
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ ok: true }));
                        return;
                    }

                    // ══════════════════════════════════════════════════════════
                    // 🚀 CRUD FILE SYSTEM ENDPOINTS
                    // ══════════════════════════════════════════════════════════

                    // 7. Create New Folder
                    if (pathname === '/api/files/newFolder' && req.method === 'POST') {
                        const body = await LocalServer.parseJsonBody(req);
                        const { currentPath, folderName } = body;
                        if (!currentPath || !folderName) {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'currentPath and folderName are required' }));
                            return;
                        }
                        const targetDir = path.join(currentPath, folderName);
                        await fs.promises.mkdir(targetDir, { recursive: true });
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, path: targetDir }));
                        return;
                    }

                    // 8. Create New File
                    if (pathname === '/api/files/newFile' && req.method === 'POST') {
                        const body = await LocalServer.parseJsonBody(req);
                        const { currentPath, fileName, content } = body;
                        if (!currentPath || !fileName) {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'currentPath and fileName are required' }));
                            return;
                        }
                        const targetFile = path.join(currentPath, fileName);
                        await fs.promises.writeFile(targetFile, content || '', 'utf8');
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, path: targetFile }));
                        return;
                    }

                    // 9. Rename File or Folder
                    if (pathname === '/api/files/rename' && req.method === 'POST') {
                        const body = await LocalServer.parseJsonBody(req);
                        const { oldPath, newName } = body;
                        if (!oldPath || !newName) {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'oldPath and newName are required' }));
                            return;
                        }
                        const parentDir = path.dirname(oldPath);
                        const newPath = path.join(parentDir, newName);
                        await fs.promises.rename(oldPath, newPath);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, path: newPath }));
                        return;
                    }

                    // 10. Delete File or Folder
                    if (pathname === '/api/files/delete' && req.method === 'POST') {
                        const body = await LocalServer.parseJsonBody(req);
                        const { targetPath } = body;
                        if (!targetPath || !fs.existsSync(targetPath)) {
                            res.writeHead(404, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'Path not found' }));
                            return;
                        }
                        const stat = await fs.promises.stat(targetPath);
                        if (stat.isDirectory()) {
                            await fs.promises.rm(targetPath, { recursive: true, force: true });
                        } else {
                            await fs.promises.unlink(targetPath);
                        }
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true }));
                        return;
                    }

                    // 11. Copy File or Folder
                    if (pathname === '/api/files/copy' && req.method === 'POST') {
                        const body = await LocalServer.parseJsonBody(req);
                        const { source, destinationDir } = body;
                        if (!source || !destinationDir || !fs.existsSync(source)) {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'Valid source and destinationDir are required' }));
                            return;
                        }
                        const baseName = path.basename(source);
                        let destPath = path.join(destinationDir, baseName);
                        
                        // If copying into same directory, add " - Copy"
                        if (fs.existsSync(destPath) && path.dirname(source) === destinationDir) {
                            const ext = path.extname(baseName);
                            const nameWithoutExt = path.basename(baseName, ext);
                            destPath = path.join(destinationDir, `${nameWithoutExt} - Copy${ext}`);
                        }

                        await fs.promises.cp(source, destPath, { recursive: true });
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, path: destPath }));
                        return;
                    }

                    // 12. Move / Cut File or Folder
                    if (pathname === '/api/files/move' && req.method === 'POST') {
                        const body = await LocalServer.parseJsonBody(req);
                        const { source, destinationDir } = body;
                        if (!source || !destinationDir || !fs.existsSync(source)) {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'Valid source and destinationDir are required' }));
                            return;
                        }
                        const baseName = path.basename(source);
                        const destPath = path.join(destinationDir, baseName);
                        await fs.promises.rename(source, destPath);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, path: destPath }));
                        return;
                    }

                    // 13. File Properties / Details
                    if (pathname === '/api/files/details') {
                        const targetPath = reqUrl.searchParams.get('path');
                        if (!targetPath || !fs.existsSync(targetPath)) {
                            res.writeHead(404, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'Path not found' }));
                            return;
                        }
                        const stat = await fs.promises.stat(targetPath);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            name: path.basename(targetPath),
                            path: targetPath,
                            isDirectory: stat.isDirectory(),
                            size: stat.size,
                            created: stat.birthtime.toISOString(),
                            modified: stat.mtime.toISOString(),
                            accessed: stat.atime.toISOString()
                        }));
                        return;
                    }

                    res.writeHead(404);
                    res.end('Not Found');
                } catch (err: any) {
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    res.end(err.message || 'Internal Server Error');
                }
            });

            server.listen(port, '127.0.0.1', () => {
                LocalServer._server = server;
                resolve();
            });

            server.on('error', (err) => reject(err));
        });
    }

    private static getSystemRoots(): any[] {
        const roots: any[] = [];
        const isWindows = process.platform === 'win32';

        if (isWindows) {
            const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
            for (const letter of letters) {
                try {
                    const drivePath = `${letter}:\\`;
                    if (fs.existsSync(drivePath)) {
                        roots.push({
                            name: `Drive ${letter}: (${drivePath})`,
                            path: drivePath,
                            type: 'Drive'
                        });
                    }
                } catch {}
            }
        } else {
            roots.push({ name: '/ (Root)', path: '/', type: 'Drive' });
        }

        const home = os.homedir();
        if (fs.existsSync(home)) {
            roots.push({ name: 'Home (~)', path: home, type: 'Home' });
        }

        const desktop = path.join(home, 'Desktop');
        if (fs.existsSync(desktop)) {
            roots.push({ name: 'Desktop', path: desktop, type: 'Desktop' });
        }

        const documents = path.join(home, 'Documents');
        if (fs.existsSync(documents)) {
            roots.push({ name: 'Documents', path: documents, type: 'Documents' });
        }

        const downloads = path.join(home, 'Downloads');
        if (fs.existsSync(downloads)) {
            roots.push({ name: 'Downloads', path: downloads, type: 'Folder' });
        }

        return roots;
    }

    private static execPromise(cmd: string, opts: any = {}): Promise<string> {
        return new Promise((resolve) => {
            exec(cmd, opts, (err: any, stdout: any) => {
                resolve(String(stdout || ""));
            });
        });
    }

    private static async performAgentSearch(query: string, scope: string, currentPath: string, maxResults: number): Promise<{ engine: string, items: any[] }> {
        const isMac = process.platform === "darwin";
        const isWindows = process.platform === "win32";
        const cleanQuery = query.replace(/["`$;|&><]/g, "").trim();

        if (isMac) {
            let scopeArg = "";
            if (scope === "home") scopeArg = `-onlyin "${os.homedir()}"`;
            else if (scope === "current" && currentPath && fs.existsSync(currentPath)) scopeArg = `-onlyin "${currentPath}"`;

            let mdfindExpr = "";
            if (cleanQuery.startsWith("*.")) {
                const ext = cleanQuery.slice(2);
                mdfindExpr = `"kMDItemFSName == '*.${ext}'c"`;
            } else if (cleanQuery.startsWith(".")) {
                const ext = cleanQuery.slice(1);
                mdfindExpr = `"kMDItemFSName == '*.${ext}'c"`;
            } else {
                mdfindExpr = `"kMDItemFSName == '*${cleanQuery}*'c"`;
            }

            const cmd = `mdfind ${scopeArg} ${mdfindExpr} | head -n ${maxResults}`;
            const output = await LocalServer.execPromise(cmd, { maxBuffer: 10 * 1024 * 1024 });
            const lines = output.trim().split("\n").filter(Boolean);

            const items: any[] = [];
            for (const filePath of lines) {
                try {
                    if (!fs.existsSync(filePath)) continue;
                    const stat = await fs.promises.stat(filePath);
                    const isDir = stat.isDirectory();
                    items.push({
                        name: path.basename(filePath),
                        path: filePath,
                        directory: path.dirname(filePath),
                        isDirectory: isDir,
                        type: isDir ? "Directory" : "File",
                        size: isDir ? 0 : stat.size,
                        modified: stat.mtime.toISOString()
                    });
                } catch {}
            }
            return { engine: "Apple Spotlight Index (mdfind)", items };
        } else if (isWindows) {
            let rootSearchPath = "C:\\Users";
            if (scope === "home") rootSearchPath = os.homedir();
            if (scope === "current" && currentPath) rootSearchPath = currentPath;

            const psCmd = `powershell -NoProfile -Command "Get-ChildItem -Path '${rootSearchPath}' -Filter '*${cleanQuery}*' -Recurse -ErrorAction SilentlyContinue | Select-Object -First ${maxResults} -Property FullName, Name, PSIsContainer, Length, LastWriteTime | ConvertTo-Json"`;
            let items: any[] = [];
            try {
                const output = await LocalServer.execPromise(psCmd, { maxBuffer: 10 * 1024 * 1024 });
                const parsed = JSON.parse(output || "[]");
                const list = Array.isArray(parsed) ? parsed : [parsed];
                for (const item of list) {
                    if (!item || !item.FullName) continue;
                    items.push({
                        name: item.Name,
                        path: item.FullName,
                        directory: path.dirname(item.FullName),
                        isDirectory: Boolean(item.PSIsContainer),
                        type: item.PSIsContainer ? "Directory" : "File",
                        size: item.Length || 0,
                        modified: item.LastWriteTime ? new Date(item.LastWriteTime).toISOString() : new Date().toISOString()
                    });
                }
            } catch {}
            return { engine: "Windows Search Index", items };
        } else {
            let targetDir = os.homedir();
            if (scope === "machine") targetDir = "/";
            if (scope === "current" && currentPath) targetDir = currentPath;

            const cmd = `find "${targetDir}" -iname "*${cleanQuery}*" -maxdepth 6 2>/dev/null | head -n ${maxResults}`;
            const output = await LocalServer.execPromise(cmd, { maxBuffer: 10 * 1024 * 1024 });
            const lines = output.trim().split("\n").filter(Boolean);
            const items: any[] = [];
            for (const filePath of lines) {
                try {
                    if (!fs.existsSync(filePath)) continue;
                    const stat = await fs.promises.stat(filePath);
                    items.push({
                        name: path.basename(filePath),
                        path: filePath,
                        directory: path.dirname(filePath),
                        isDirectory: stat.isDirectory(),
                        type: stat.isDirectory() ? "Directory" : "File",
                        size: stat.isDirectory() ? 0 : stat.size,
                        modified: stat.mtime.toISOString()
                    });
                } catch {}
            }
            return { engine: "Linux find index", items };
        }
    }

    private static async getGitStatus(dirPath: string): Promise<{ isRepo: boolean; branch?: string; ahead?: number; behind?: number; statuses?: Record<string, string> }> {
        try {
            if (!dirPath || !fs.existsSync(dirPath)) return { isRepo: false };
            let dir = dirPath;
            try {
                const stat = await fs.promises.stat(dirPath);
                if (!stat.isDirectory()) dir = path.dirname(dirPath);
            } catch { return { isRepo: false }; }

            // 1. Check if inside git repo
            const isRepo = await new Promise<boolean>((resolve) => {
                exec('git rev-parse --is-inside-work-tree', { cwd: dir }, (err, stdout) => {
                    resolve(!err && stdout.trim() === 'true');
                });
            });

            if (!isRepo) return { isRepo: false };

            // 2. Get branch name
            const branch = await new Promise<string>((resolve) => {
                exec('git rev-parse --abbrev-ref HEAD', { cwd: dir }, (err, stdout) => {
                    resolve(err ? 'HEAD' : stdout.trim());
                });
            });

            // 3. Ahead / Behind counts
            let ahead = 0, behind = 0;
            await new Promise<void>((resolve) => {
                exec('git rev-list --left-right --count HEAD...@{u}', { cwd: dir }, (err, stdout) => {
                    if (!err && stdout) {
                        const parts = stdout.trim().split(/\s+/);
                        if (parts.length >= 2) {
                            ahead = parseInt(parts[0], 10) || 0;
                            behind = parseInt(parts[1], 10) || 0;
                        }
                    }
                    resolve();
                });
            });

            // 4. Repo toplevel root
            const repoRoot = await new Promise<string>((resolve) => {
                exec('git rev-parse --show-toplevel', { cwd: dir }, (err, stdout) => {
                    resolve(err ? '' : stdout.trim());
                });
            });

            const statuses: Record<string, string> = {};
            if (repoRoot) {
                await new Promise<void>((resolve) => {
                    exec('git status --porcelain=v1 -uall', { cwd: dir, maxBuffer: 1024 * 1024 * 2 }, (err, stdout) => {
                        if (!err && stdout) {
                            const lines = stdout.split('\n');
                            for (const line of lines) {
                                if (line.length < 4) continue;
                                const xy = line.substring(0, 2);
                                let code = 'M';
                                if (xy.includes('?')) code = 'U';
                                else if (xy.includes('A')) code = 'A';
                                else if (xy.includes('D')) code = 'D';
                                else if (xy.includes('R')) code = 'R';
                                else if (xy.includes('M')) code = 'M';

                                let relToRepo = line.substring(3).trim();
                                if (relToRepo.includes(' -> ')) {
                                    relToRepo = relToRepo.split(' -> ')[1];
                                }
                                if (relToRepo.startsWith('"') && relToRepo.endsWith('"')) {
                                    relToRepo = relToRepo.slice(1, -1);
                                }
                                const absFilePath = path.resolve(repoRoot, relToRepo);
                                const relToDir = path.relative(dir, absFilePath);

                                if (!relToDir.startsWith('..') && !path.isAbsolute(relToDir)) {
                                    const topSegment = relToDir.split(path.sep)[0];
                                    if (topSegment) {
                                        if (!statuses[topSegment] || code === 'M') {
                                            statuses[topSegment] = code;
                                        }
                                    }
                                }
                            }
                        }
                        resolve();
                    });
                });
            }

            return { isRepo: true, branch, ahead, behind, statuses };
        } catch {
            return { isRepo: false };
        }
    }

    private static getIndexHtml(): string {
        const htmlPath = path.join(__dirname, '..', 'media', 'index.html');
        if (fs.existsSync(htmlPath)) {
            return fs.readFileSync(htmlPath, 'utf8');
        }
        return '<h1>VenEl File Manager</h1><p>UI loading error</p>';
    }
}
