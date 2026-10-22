import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export type LogLevel = 'Error' | 'Warning' | 'Info' | 'Debug';

const LOG_LEVEL_SEVERITY: Record<LogLevel, number> = {
    Debug: 0,
    Info: 1,
    Warning: 2,
    Error: 3
};

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB per daily file cap
const RECENT_BUFFER_SIZE = 100;

export class Logger {
    private static _context: vscode.ExtensionContext | null = null;
    private static _channel: vscode.OutputChannel | null = null;
    private static _logDir: string = '';
    private static _recentBuffer: string[] = [];
    private static _initialized = false;

    public static initialize(context: vscode.ExtensionContext): void {
        this._context = context;
        if (!this._channel) {
            this._channel = vscode.window.createOutputChannel('VenEl Engine');
        }

        try {
            const baseDir = context.globalStorageUri
                ? context.globalStorageUri.fsPath
                : path.join(os.homedir(), '.venel');
            this._logDir = path.join(baseDir, 'logs');
            if (!fs.existsSync(this._logDir)) {
                fs.mkdirSync(this._logDir, { recursive: true });
            }
            this._initialized = true;
            this.cleanupOldLogs();
            this.info(`[Logger] Initialized. Log folder: ${this._logDir}`);
        } catch (e: any) {
            console.error('[VenEl Logger] Could not initialize disk logging directory:', e);
            if (this._channel) {
                this._channel.appendLine(`[${new Date().toLocaleTimeString()}] [WARN] Could not initialize disk logs: ${e?.message}`);
            }
        }
    }

    public static getLogFolderPath(): string {
        return this._logDir;
    }

    public static getTodayLogPath(): string {
        if (!this._logDir) return '';
        const dateStr = this.getTodayDateString();
        return path.join(this._logDir, `venel-${dateStr}.log`);
    }

    public static getRecentLogs(maxLines = 35): string {
        // Return from in-memory ring buffer, or fallback to reading today's file if buffer empty
        if (this._recentBuffer.length > 0) {
            return this._recentBuffer.slice(-maxLines).join('\n');
        }
        const todayFile = this.getTodayLogPath();
        if (todayFile && fs.existsSync(todayFile)) {
            try {
                const content = fs.readFileSync(todayFile, 'utf8');
                const lines = content.split('\n');
                return lines.slice(-maxLines).join('\n');
            } catch {}
        }
        return 'No recent logs recorded.';
    }

    public static info(msg: string, ...args: any[]): void {
        this.writeEntry('Info', msg, args);
    }

    public static warn(msg: string, ...args: any[]): void {
        this.writeEntry('Warning', msg, args);
    }

    public static error(msg: string, err?: any): void {
        let fullMsg = msg;
        if (err) {
            if (err instanceof Error) {
                fullMsg += ` | Error: ${err.message}\n${err.stack || ''}`;
            } else {
                fullMsg += ` | Error: ${String(err)}`;
            }
        }
        this.writeEntry('Error', fullMsg);
    }

    public static debug(msg: string, ...args: any[]): void {
        this.writeEntry('Debug', msg, args);
    }

    public static showOutputChannel(): void {
        if (this._channel) {
            this._channel.show();
        }
    }

    public static revealLogFolder(): void {
        if (this._logDir && fs.existsSync(this._logDir)) {
            vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(this._logDir));
        } else {
            vscode.window.showInformationMessage('No log directory found yet. Perform an action to generate logs.');
        }
    }

    public static async openTodayLog(): Promise<void> {
        const todayPath = this.getTodayLogPath();
        if (todayPath && fs.existsSync(todayPath)) {
            const doc = await vscode.workspace.openTextDocument(todayPath);
            await vscode.window.showTextDocument(doc);
        } else {
            vscode.window.showInformationMessage("No log file found for today. Perform an action to generate logs.");
        }
    }

    private static writeEntry(level: LogLevel, message: string, extraArgs?: any[]): void {
        const config = vscode.workspace.getConfiguration('venel.filemanager.logging');
        const configuredLevel = config.get<LogLevel>('level', 'Info');

        // Check verbosity threshold
        if (LOG_LEVEL_SEVERITY[level] < LOG_LEVEL_SEVERITY[configuredLevel]) {
            return;
        }

        let formattedMsg = message;
        if (extraArgs && extraArgs.length > 0) {
            formattedMsg += ' ' + extraArgs.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
        }

        const now = new Date();
        const timeStr = now.toLocaleTimeString();
        const isoTime = now.toISOString();
        const logLine = `[${isoTime}] [${level.toUpperCase()}] ${formattedMsg}`;

        // 1. In-memory recent ring buffer
        this._recentBuffer.push(logLine);
        if (this._recentBuffer.length > RECENT_BUFFER_SIZE) {
            this._recentBuffer.shift();
        }

        // 2. Output channel & console
        if (this._channel) {
            this._channel.appendLine(`[${timeStr}] [${level}] ${formattedMsg}`);
        }
        if (level === 'Error') {
            console.error(`[VenEl ${level}] ${formattedMsg}`);
        } else {
            console.log(`[VenEl ${level}] ${formattedMsg}`);
        }

        // 3. Persistent daily file on disk
        const retentionDays = config.get<number>('retentionDays', 1);
        if (retentionDays <= 0 || !this._initialized || !this._logDir) {
            return; // Memory only when retentionDays <= 0
        }

        try {
            const logPath = this.getTodayLogPath();
            // Cap file size at 5MB
            if (fs.existsSync(logPath)) {
                const stat = fs.statSync(logPath);
                if (stat.size > MAX_FILE_SIZE_BYTES) {
                    // Truncate oldest half if runaway
                    const content = fs.readFileSync(logPath, 'utf8');
                    const lines = content.split('\n');
                    const kept = lines.slice(Math.floor(lines.length / 2)).join('\n');
                    fs.writeFileSync(logPath, `--- Log truncated to conserve disk space (${new Date().toISOString()}) ---\n` + kept);
                }
            }
            fs.appendFileSync(logPath, logLine + '\n', 'utf8');
        } catch (e) {
            console.warn('[VenEl Logger] Failed to write entry to disk file:', e);
        }
    }

    /**
     * Self-cleaning routine: scans logs folder and deletes any log file older than configured retentionDays
     */
    public static cleanupOldLogs(): void {
        if (!this._logDir || !fs.existsSync(this._logDir)) return;

        const config = vscode.workspace.getConfiguration('venel.filemanager.logging');
        const retentionDays = config.get<number>('retentionDays', 1);
        if (retentionDays <= 0) {
            // Retention <= 0 means disk logging is disabled; clean up existing logs
            try {
                const files = fs.readdirSync(this._logDir);
                for (const f of files) {
                    if (f.startsWith('venel-') && f.endsWith('.log')) {
                        fs.unlinkSync(path.join(this._logDir, f));
                    }
                }
            } catch {}
            return;
        }

        const now = Date.now();
        const maxAgeMs = retentionDays * 24 * 60 * 60 * 1000;

        try {
            const files = fs.readdirSync(this._logDir);
            for (const file of files) {
                // Match venel-YYYY-MM-DD.log
                const match = file.match(/^venel-(\d{4}-\d{2}-\d{2})\.log$/);
                if (match) {
                    const fileDateStr = match[1];
                    const fileTime = new Date(fileDateStr + 'T00:00:00').getTime();
                    if (!isNaN(fileTime) && (now - fileTime) > maxAgeMs) {
                        const targetPath = path.join(this._logDir, file);
                        fs.unlinkSync(targetPath);
                        if (this._channel) {
                            this._channel.appendLine(`[${new Date().toLocaleTimeString()}] [Logger] Auto-cleaned expired log file: ${file}`);
                        }
                    }
                }
            }
        } catch (e: any) {
            console.warn('[VenEl Logger] Error during cleanupOldLogs:', e);
        }
    }

    private static getTodayDateString(): string {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
}
