import { app, BrowserWindow, dialog, shell } from 'electron';
import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';
import log from 'electron-log';
import { autoUpdater } from 'electron-updater';

log.transports.file.level = 'info';
log.info('Veo Farm starting…');

// ─── Helpers ────────────────────────────────────────────────────────────────

function findOpenPort(start = 41000): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(start, () => {
      const addr = srv.address();
      srv.close(() => {
        if (addr && typeof addr === 'object') resolve(addr.port);
        else reject(new Error('Cannot determine port'));
      });
    });
  });
}

function resolveResource(rel: string): string {
  // In packaged app, extraResources land in process.resourcesPath; in dev,
  // we walk up from this file to the monorepo root.
  if (app.isPackaged) {
    return path.join(process.resourcesPath, rel);
  }
  return path.join(__dirname, '..', '..', '..', rel);
}

function detectBraveExe(): string | null {
  const candidates =
    process.platform === 'win32'
      ? [
          'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
          'C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
          path.join(
            process.env.LOCALAPPDATA ?? '',
            'BraveSoftware\\Brave-Browser\\Application\\brave.exe',
          ),
        ]
      : process.platform === 'darwin'
        ? ['/Applications/Brave Browser.app/Contents/MacOS/Brave Browser']
        : ['/usr/bin/brave-browser', '/usr/bin/brave'];
  return candidates.find((p) => p && fs.existsSync(p)) ?? null;
}

// ─── Process supervision ────────────────────────────────────────────────────

const children: ChildProcess[] = [];

function spawnChild(name: string, cmd: string, args: string[], env: NodeJS.ProcessEnv) {
  log.info(`spawn ${name}: ${cmd} ${args.join(' ')}`);
  const child = spawn(cmd, args, {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (d) => log.info(`[${name}] ${d.toString().trim()}`));
  child.stderr?.on('data', (d) => log.warn(`[${name}] ${d.toString().trim()}`));
  child.on('exit', (code) => log.warn(`[${name}] exited code=${code}`));
  children.push(child);
  return child;
}

function killChildren() {
  for (const c of children) {
    try {
      c.kill();
    } catch {
      // ignore
    }
  }
}

// ─── Boot ───────────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;

async function startEmbeddedServer(): Promise<string> {
  const port = await findOpenPort(41000);
  const webRoot = resolveResource('web');
  const serverJs = path.join(webRoot, 'apps', 'web', 'server.js');
  if (!fs.existsSync(serverJs)) {
    throw new Error(`Next standalone server not found at ${serverJs}. Run \`pnpm build\` first.`);
  }
  spawnChild('web', process.execPath, [serverJs], {
    PORT: String(port),
    HOSTNAME: '127.0.0.1',
    NODE_ENV: 'production',
    ELECTRON_RUN_AS_NODE: '1',
  });

  // Worker — long-lived background process.
  const workerEntry = path.join(resolveResource('worker'), 'index.js');
  if (fs.existsSync(workerEntry)) {
    const bravePath = detectBraveExe();
    spawnChild('worker', process.execPath, [workerEntry], {
      ELECTRON_RUN_AS_NODE: '1',
      ...(bravePath ? { BRAVE_BROWSER_PATH: bravePath } : {}),
      FFMPEG_PATH: path.join(
        resolveResource('ffmpeg'),
        process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg',
      ),
    });
  } else {
    log.warn(`worker entry not found at ${workerEntry} — skipping`);
  }

  // Wait for the Next server to accept TCP — up to 30s.
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await canConnect(port)) return `http://127.0.0.1:${port}`;
    await sleep(500);
  }
  throw new Error('Next server did not start in time');
}

function canConnect(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.createConnection({ port, host: '127.0.0.1' });
    sock.once('connect', () => {
      sock.end();
      resolve(true);
    });
    sock.once('error', () => resolve(false));
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function createWindow() {
  let url: string;
  try {
    url = await startEmbeddedServer();
  } catch (e) {
    dialog.showErrorBox('Veo Farm', `Không khởi động được app:\n\n${(e as Error).message}`);
    app.quit();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    backgroundColor: '#0a0a14',
    title: 'Veo Farm',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(url);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Brave detection prompt.
  if (!detectBraveExe()) {
    dialog
      .showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Cần cài Brave Browser',
        message:
          'Veo Farm cần Brave Browser để render video. Mở trang download Brave bây giờ?',
        buttons: ['Mở trang Brave', 'Bỏ qua'],
        defaultId: 0,
      })
      .then((res) => {
        if (res.response === 0) shell.openExternal('https://brave.com/download/');
      });
  }
}

// ─── Auto-update ────────────────────────────────────────────────────────────

function setupAutoUpdate() {
  if (!app.isPackaged) {
    log.info('skip auto-update (dev mode)');
    return;
  }
  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    log.info('update-available', info?.version);
  });
  autoUpdater.on('update-downloaded', async (info) => {
    log.info('update-downloaded', info?.version);
    if (!mainWindow) return;
    const res = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update sẵn sàng',
      message: `Phiên bản mới ${info?.version} đã tải xong. Restart để cập nhật?`,
      buttons: ['Restart ngay', 'Để sau'],
      defaultId: 0,
    });
    if (res.response === 0) autoUpdater.quitAndInstall();
  });
  autoUpdater.on('error', (err) => log.error('updater error', err));

  // First check on launch + every hour.
  autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  setInterval(() => autoUpdater.checkForUpdatesAndNotify().catch(() => {}), 60 * 60 * 1000);
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();
  setupAutoUpdate();
});

app.on('window-all-closed', () => {
  killChildren();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', killChildren);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
