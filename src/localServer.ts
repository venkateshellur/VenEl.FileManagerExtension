import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { exec, execFile } from 'child_process';
import { KestrelLauncher } from './kestrelLauncher';

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

        const preferredPort = 5055;
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
                    res.setHeader('X-Engine', 'VenEl-Node');

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
                        const handle = await fs.promises.open(targetPath, 'r');
                        const sampleBuf = Buffer.alloc(1024);
                        const { bytesRead } = await handle.read(sampleBuf, 0, 1024, 0);
                        await handle.close();
                        const isBinary = sampleBuf.subarray(0, bytesRead).includes(0);
                        if (isBinary) {
                            res.writeHead(415, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ isBinary: true, message: 'Binary file' }));
                            return;
                        }
                        const content = await fs.promises.readFile(targetPath, 'utf8');
                        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
                        res.end(content);
                        return;
                    }

                    // 5. Raw File (Images / Media / Documents)
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
                            '.webp': 'image/webp',
                            '.ico': 'image/x-icon',
                            '.bmp': 'image/bmp',
                            '.pdf': 'application/pdf',
                            '.mp3': 'audio/mpeg',
                            '.wav': 'audio/wav',
                            '.ogg': 'audio/ogg',
                            '.m4a': 'audio/mp4',
                            '.aac': 'audio/aac',
                            '.flac': 'audio/flac',
                            '.mp4': 'video/mp4',
                            '.webm': 'video/webm',
                            '.mov': 'video/quicktime',
                            '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                            '.xls': 'application/vnd.ms-excel',
                            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                            '.csv': 'text/csv; charset=utf-8',
                            '.tsv': 'text/tab-separated-values; charset=utf-8',
                            '.txt': 'text/plain; charset=utf-8',
                            '.json': 'application/json',
                            '.md': 'text/markdown; charset=utf-8'
                        };
                        const contentType = mimeMap[ext] || 'application/octet-stream';
                        const headers: Record<string, string> = {
                            'Content-Type': contentType,
                            'Access-Control-Allow-Origin': '*'
                        };
                        if (ext === '.pdf') {
                            headers['Content-Disposition'] = 'inline; filename="' + path.basename(targetPath) + '"';
                        }
                        res.writeHead(200, headers);
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

                    // 6h. Decompile & Inspect Binary (.NET DLL/EXE, Java class/jar)
                    if (pathname === '/api/files/decompile') {
                        const targetPath = reqUrl.searchParams.get('path');
                        if (!targetPath || !fs.existsSync(targetPath)) {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ isSuccess: false, errorMessage: 'Valid file path is required.' }));
                            return;
                        }

                        // 1. Ensure Kestrel backend engine is running on port 5050
                        try {
                            await KestrelLauncher.ensureRunning();
                        } catch {}

                        // 2. Forward to Kestrel on 5050 (try 127.0.0.1 first, then localhost)
                        const endpoints = [
                            `http://127.0.0.1:5050/api/files/decompile?path=${encodeURIComponent(targetPath)}`,
                            `http://localhost:5050/api/files/decompile?path=${encodeURIComponent(targetPath)}`
                        ];

                        for (const forwardUrl of endpoints) {
                            try {
                                const kestrelRes = await new Promise<any>((resolve, reject) => {
                                    const kReq = http.get(forwardUrl, { timeout: 15000 }, (kRes) => {
                                        let data = '';
                                        kRes.on('data', chunk => { data += chunk; });
                                        kRes.on('end', () => {
                                            try { resolve(JSON.parse(data)); } catch { reject(); }
                                        });
                                    });
                                    kReq.on('error', reject);
                                    kReq.on('timeout', () => { kReq.destroy(); reject(); });
                                });

                                if (kestrelRes && typeof kestrelRes.isSuccess === 'boolean') {
                                    res.writeHead(200, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify(kestrelRes));
                                    return;
                                }
                            } catch {}
                        }

                        // Fallback response with native PE analysis and clear diagnostics
                        const ext = path.extname(targetPath).toLowerCase();
                        const stat = fs.statSync(targetPath);
                        const peInfo = LocalServer.inspectBinaryHeader(targetPath);
                        const diag = KestrelLauncher.lastDiagnostic;

                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            path: targetPath,
                            fileName: path.basename(targetPath),
                            format: peInfo.format || (ext === '.dll' || ext === '.exe' ? '.NET Assembly' : 'Java Binary'),
                            architecture: peInfo.architecture || 'Unknown',
                            targetFramework: peInfo.targetFramework || undefined,
                            deterministicSummary: `Binary file '${path.basename(targetPath)}' (${(stat.size / 1024).toFixed(1)} KB, ${peInfo.architecture}). Engine Status: ${diag}`,
                            dependencies: [],
                            outline: [],
                            decompiledCode: `// ═════════════════════════════════════════════════════════════════════\n` +
                                           `// VenEl Binary Decompiler Diagnostic\n` +
                                           `// ═════════════════════════════════════════════════════════════════════\n` +
                                           `// File: ${path.basename(targetPath)}\n` +
                                           `// Size: ${(stat.size / 1024).toFixed(1)} KB\n` +
                                           `// Format: ${peInfo.format}\n` +
                                           `// Architecture: ${peInfo.architecture}\n` +
                                           (peInfo.targetFramework ? `// Target: ${peInfo.targetFramework}\n` : '') +
                                           `//\n` +
                                           `// Status: Background .NET engine offline\n` +
                                           `// Diagnostic: ${diag}\n//\n` +
                                           `// Resolution tips:\n` +
                                           `// 1. Ensure .NET 8 Runtime or SDK is installed on this machine ('dotnet --version').\n` +
                                           `// 2. All file browsing, editing, zip, batch rename, and PE analysis remain functional.\n` +
                                           `// 3. Check VS Code Output tab -> 'VenEl Engine' for live launch logs.`,
                            isSuccess: true
                        }));
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

                    // 10. Delete File or Folder -> Move to OS Trash / Recycle Bin
                    if (pathname === '/api/files/delete' && req.method === 'POST') {
                        const body = await LocalServer.parseJsonBody(req);
                        const paths: string[] = [];
                        if (body.targetPath || body.path) {
                            paths.push(body.targetPath || body.path);
                        }
                        if (Array.isArray(body.paths)) {
                            for (const p of body.paths) {
                                if (p && typeof p === 'string' && !paths.includes(p)) {
                                    paths.push(p);
                                }
                            }
                        }

                        if (paths.length === 0) {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'targetPath or paths array is required' }));
                            return;
                        }

                        let trashedCount = 0;
                        const errors: string[] = [];
                        for (const p of paths) {
                            try {
                                if (fs.existsSync(p)) {
                                    await LocalServer.moveToTrash(p);
                                    trashedCount++;
                                }
                            } catch (err: any) {
                                errors.push(err.message);
                            }
                        }

                        if (trashedCount > 0 || errors.length === 0) {
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: true, count: trashedCount }));
                        } else {
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: errors.join(', ') }));
                        }
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

                    // 12b. Batch Rename Files or Folders
                    if (pathname === '/api/files/batch-rename' && req.method === 'POST') {
                        const body = await LocalServer.parseJsonBody(req);
                        const { currentPath, renames } = body;
                        if (!currentPath || !Array.isArray(renames) || renames.length === 0) {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'currentPath and renames array are required' }));
                            return;
                        }

                        const results: { oldName: string; newName: string; success: boolean; error?: string }[] = [];
                        for (const item of renames) {
                            if (!item.oldName || !item.newName || item.oldName === item.newName) {
                                results.push({ oldName: item.oldName, newName: item.newName, success: true });
                                continue;
                            }
                            const oldFullPath = path.join(currentPath, item.oldName);
                            const newFullPath = path.join(currentPath, item.newName);

                            if (!fs.existsSync(oldFullPath)) {
                                results.push({ oldName: item.oldName, newName: item.newName, success: false, error: 'Source not found' });
                                continue;
                            }

                            try {
                                if (item.oldName.toLowerCase() === item.newName.toLowerCase()) {
                                    const tempPath = path.join(currentPath, `__venel_tmp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}_${item.oldName}`);
                                    await fs.promises.rename(oldFullPath, tempPath);
                                    await fs.promises.rename(tempPath, newFullPath);
                                } else {
                                    await fs.promises.rename(oldFullPath, newFullPath);
                                }
                                results.push({ oldName: item.oldName, newName: item.newName, success: true });
                            } catch (err: any) {
                                results.push({ oldName: item.oldName, newName: item.newName, success: false, error: err.message });
                            }
                        }

                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, count: results.filter(r => r.success).length, renamedCount: results.filter(r => r.success).length, results }));
                        return;
                    }

                    // 12c. Compress Files / Folders to .zip
                    if (pathname === '/api/files/compress' && req.method === 'POST') {
                        const body = await LocalServer.parseJsonBody(req);
                        const currentPath = (body.currentPath || body.folder || '').trim();
                        const items = body.items;
                        const archiveName = body.archiveName;
                        if (!currentPath || !Array.isArray(items) || items.length === 0) {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'currentPath and items array are required' }));
                            return;
                        }

                        let targetArchiveName = (archiveName || '').trim();
                        if (!targetArchiveName) {
                            targetArchiveName = items.length === 1 ? `${items[0]}.zip` : 'Archive.zip';
                        }
                        if (!targetArchiveName.toLowerCase().endsWith('.zip')) {
                            targetArchiveName += '.zip';
                        }

                        let counter = 1;
                        let finalArchiveName = targetArchiveName;
                        let archiveFullPath = path.join(currentPath, finalArchiveName);
                        while (fs.existsSync(archiveFullPath)) {
                            const baseWithoutExt = targetArchiveName.slice(0, -4);
                            finalArchiveName = `${baseWithoutExt}_${counter}.zip`;
                            archiveFullPath = path.join(currentPath, finalArchiveName);
                            counter++;
                        }

                        try {
                            const isWin = os.platform() === 'win32';
                            let compressed = false;
                            let lastError: any = null;

                            // Strategy 1: bsdtar (built into Windows 10/11, macOS, and Linux)
                            try {
                                await new Promise<void>((resolve, reject) => {
                                    execFile('tar', ['-a', '-cf', archiveFullPath, ...items], { cwd: currentPath }, (err, stdout, stderr) => {
                                        if (!err && fs.existsSync(archiveFullPath) && fs.statSync(archiveFullPath).size > 0) {
                                            resolve();
                                        } else {
                                            reject(err || new Error(stderr || 'tar failed'));
                                        }
                                    });
                                });
                                compressed = true;
                            } catch (e) {
                                lastError = e;
                            }

                            // Strategy 2: macOS / Linux standard 'zip' tool
                            if (!compressed && !isWin) {
                                try {
                                    await new Promise<void>((resolve, reject) => {
                                        execFile('zip', ['-r', '-q', archiveFullPath, ...items], { cwd: currentPath }, (err, stdout, stderr) => {
                                            if (fs.existsSync(archiveFullPath) && fs.statSync(archiveFullPath).size > 0) {
                                                resolve();
                                            } else {
                                                reject(err || new Error(stderr || 'zip failed'));
                                            }
                                        });
                                    });
                                    compressed = true;
                                } catch (e) {
                                    lastError = e;
                                }
                            }

                            // Strategy 3: Windows PowerShell with -LiteralPath via execFile (no cmd.exe quote mangling)
                            if (!compressed && isWin) {
                                try {
                                    const fullPaths = items.map(i => path.resolve(currentPath, i));
                                    await new Promise<void>((resolve, reject) => {
                                        execFile('powershell.exe', [
                                            '-NoProfile',
                                            '-NonInteractive',
                                            '-Command',
                                            '& { param($dest, [string[]]$paths); Compress-Archive -LiteralPath $paths -DestinationPath $dest -Force }',
                                            archiveFullPath,
                                            ...fullPaths
                                        ], { cwd: currentPath }, (err, stdout, stderr) => {
                                            if (!err && fs.existsSync(archiveFullPath) && fs.statSync(archiveFullPath).size > 0) {
                                                resolve();
                                            } else {
                                                reject(err || new Error(stderr || 'powershell failed'));
                                            }
                                        });
                                    });
                                    compressed = true;
                                } catch (e) {
                                    lastError = e;
                                }
                            }

                            if (!compressed) {
                                throw lastError || new Error('Archive creation failed with all available strategies');
                            }

                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: true, archiveName: finalArchiveName, path: archiveFullPath }));
                        } catch (err: any) {
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: false, error: `Compression failed: ${err.message}` }));
                        }
                        return;
                    }

                    // 12d. Extract Archive (.zip, .tar, .tgz, .tar.gz)
                    if (pathname === '/api/files/extract' && req.method === 'POST') {
                        const body = await LocalServer.parseJsonBody(req);
                        let archivePath = (body.archivePath || '').trim();
                        if (!archivePath && (body.folder || body.currentPath) && body.archiveName) {
                            archivePath = path.join(body.folder || body.currentPath, body.archiveName);
                        }
                        if (!archivePath || !fs.existsSync(archivePath)) {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'Valid archivePath is required' }));
                            return;
                        }

                        let targetDir = body.destinationDir || body.destinationFolder;
                        if (!targetDir) {
                            targetDir = path.dirname(archivePath);
                        } else if (!path.isAbsolute(targetDir)) {
                            targetDir = path.join(path.dirname(archivePath), targetDir);
                        }
                        await fs.promises.mkdir(targetDir, { recursive: true });

                        const lowerPath = archivePath.toLowerCase();
                        const isWin = os.platform() === 'win32';

                        try {
                            let extracted = false;
                            let lastError: any = null;

                            // Strategy 1: bsdtar (supports .zip, .tar, .tar.gz, .tgz across Win 10/11, macOS, Linux)
                            try {
                                await new Promise<void>((resolve, reject) => {
                                    execFile('tar', ['-xf', archivePath, '-C', targetDir], { cwd: targetDir }, (err, stdout, stderr) => {
                                        if (!err) resolve();
                                        else reject(err || new Error(stderr || 'tar extract failed'));
                                    });
                                });
                                extracted = true;
                            } catch (e) {
                                lastError = e;
                            }

                            // Strategy 2: macOS / Linux standard 'unzip' for .zip
                            if (!extracted && !isWin && lowerPath.endsWith('.zip')) {
                                try {
                                    await new Promise<void>((resolve, reject) => {
                                        execFile('unzip', ['-q', '-o', archivePath, '-d', targetDir], { cwd: targetDir }, (err, stdout, stderr) => {
                                            if (!err) resolve();
                                            else reject(err || new Error(stderr || 'unzip failed'));
                                        });
                                    });
                                    extracted = true;
                                } catch (e) {
                                    lastError = e;
                                }
                            }

                            // Strategy 3: Windows PowerShell Expand-Archive via execFile
                            if (!extracted && isWin && lowerPath.endsWith('.zip')) {
                                try {
                                    await new Promise<void>((resolve, reject) => {
                                        execFile('powershell.exe', [
                                            '-NoProfile',
                                            '-NonInteractive',
                                            '-Command',
                                            '& { param($src, $dest); Expand-Archive -LiteralPath $src -DestinationPath $dest -Force }',
                                            archivePath,
                                            targetDir
                                        ], { cwd: targetDir }, (err, stdout, stderr) => {
                                            if (!err) resolve();
                                            else reject(err || new Error(stderr || 'powershell extract failed'));
                                        });
                                    });
                                    extracted = true;
                                } catch (e) {
                                    lastError = e;
                                }
                            }

                            if (!extracted) {
                                throw lastError || new Error('Extraction failed with all available strategies');
                            }

                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: true, destinationDir: targetDir }));
                        } catch (err: any) {
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: false, error: `Extraction failed: ${err.message}` }));
                        }
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

    private static async moveToTrash(targetPath: string): Promise<void> {
        // 1. Try VS Code workspace.fs.delete with useTrash: true (first choice)
        try {
            await vscode.workspace.fs.delete(vscode.Uri.file(targetPath), { recursive: true, useTrash: true });
            return;
        } catch (vscodeErr) {
            console.warn(`[VenEl] vscode.workspace.fs.delete useTrash fallback for ${targetPath}:`, vscodeErr);
        }

        // 2. Native OS Trash Fallback
        const platform = os.platform();
        if (platform === 'darwin') {
            // macOS: Tell Finder to move file to Trash (preserves Put Back functionality)
            const escaped = targetPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            await new Promise<void>((resolve, reject) => {
                execFile('osascript', ['-e', `tell application "Finder" to delete POSIX file "${escaped}"`], (err, stdout, stderr) => {
                    if (err) reject(new Error(stderr || err.message)); else resolve();
                });
            });
        } else if (platform === 'win32') {
            // Windows: Use PowerShell with Microsoft.VisualBasic to send to RecycleBin
            const escaped = targetPath.replace(/'/g, "''");
            const script = `Add-Type -AssemblyName Microsoft.VisualBasic; if (Test-Path -LiteralPath '${escaped}' -PathType Container) { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory('${escaped}', 'OnlyErrorDialogs', 'SendToRecycleBin') } else { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile('${escaped}', 'OnlyErrorDialogs', 'SendToRecycleBin') }`;
            await new Promise<void>((resolve, reject) => {
                exec(`powershell.exe -NoProfile -NonInteractive -Command "${script}"`, (err, stdout, stderr) => {
                    if (err) reject(new Error(stderr || err.message)); else resolve();
                });
            });
        } else {
            // Linux: Try gio trash
            await new Promise<void>((resolve, reject) => {
                execFile('gio', ['trash', targetPath], (err, stdout, stderr) => {
                    if (err) reject(new Error(stderr || err.message)); else resolve();
                });
            });
        }
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

    public static inspectBinaryHeader(filePath: string): { format: string; architecture: string; targetFramework?: string } {
        try {
            const fd = fs.openSync(filePath, 'r');
            const buf = Buffer.alloc(8192);
            const bytesRead = fs.readSync(fd, buf, 0, 8192, 0);
            fs.closeSync(fd);

            if (bytesRead < 64) return { format: 'Binary', architecture: 'Unknown' };

            // Java Class (0xCAFEBABE)
            if (buf[0] === 0xCA && buf[1] === 0xFE && buf[2] === 0xBA && buf[3] === 0xBE) {
                const major = buf.readUInt16BE(6);
                return { format: 'Java Bytecode (.class)', architecture: `Java (v${major})` };
            }

            // Java JAR / ZIP (PK\x03\x04)
            if (buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04) {
                return { format: 'Java Archive (.jar)', architecture: 'JVM' };
            }

            // Windows PE (MZ)
            if (buf[0] === 0x4D && buf[1] === 0x5A) {
                const peOffset = buf.readUInt32LE(0x3C);
                if (peOffset + 24 < bytesRead && buf[peOffset] === 0x50 && buf[peOffset + 1] === 0x45) {
                    const machine = buf.readUInt16LE(peOffset + 4);
                    let arch = 'Unknown';
                    if (machine === 0x014c) arch = 'x86 (32-bit)';
                    else if (machine === 0x8664) arch = 'x64 (64-bit)';
                    else if (machine === 0xaa64) arch = 'ARM64';

                    // Scan for TargetFramework string in the buffer
                    const rawStr = buf.toString('latin1');
                    let tf: string | undefined = undefined;
                    const tfMatch = rawStr.match(/\.NETCoreApp,Version=v([0-9.]+)/) || rawStr.match(/\.NETFramework,Version=v([0-9.]+)/);
                    if (tfMatch) tf = tfMatch[0];

                    return { format: '.NET Assembly (PE)', architecture: arch, targetFramework: tf };
                }
            }
        } catch {}
        return { format: 'Binary', architecture: 'Unknown' };
    }

    private static getIndexHtml(): string {
        const htmlPath = path.join(__dirname, '..', 'media', 'index.html');
        if (fs.existsSync(htmlPath)) {
            return fs.readFileSync(htmlPath, 'utf8');
        }
        return '<h1>VenEl File Manager</h1><p>UI loading error</p>';
    }
}
