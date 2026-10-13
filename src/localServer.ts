import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';

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
        console.log(`[VenEl] Built-in local engine active at ${this._serverUrl}`);
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
                            if (!isDir) {
                                try {
                                    const stat = await fs.promises.stat(path.join(targetPath, entry.name));
                                    size = stat.size;
                                } catch {}
                            }
                            items.push({
                                name: entry.name,
                                type: isDir ? 'Directory' : 'File',
                                size: size
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

    private static getIndexHtml(): string {
        const htmlPath = path.join(__dirname, '..', 'media', 'index.html');
        if (fs.existsSync(htmlPath)) {
            return fs.readFileSync(htmlPath, 'utf8');
        }
        return '<h1>VenEl File Manager</h1><p>UI loading error</p>';
    }
}
