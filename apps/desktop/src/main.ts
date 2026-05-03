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

function tryPort(port: number): Promise<number | null> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.unref();
    srv.once('error', () => resolve(null));
    srv.listen(port, '127.0.0.1', () => {
      srv.close(() => resolve(port));
    });
  });
}

// Fixed port so the Supabase auth cookie (bound to 127.0.0.1:PORT) survives
// across app restarts. Falls back to ephemeral if the preferred port is busy
// — in that rare case the user has to log in once more.
async function findOpenPort(): Promise<number> {
  const PREFERRED = 41234;
  const taken = await tryPort(PREFERRED);
  if (taken) return taken;
  log.warn(`port ${PREFERRED} busy, falling back to ephemeral (will require re-login)`);
  const ephemeral = await tryPort(0);
  if (!ephemeral) throw new Error('No free port found');
  return ephemeral;
}

function resolveResource(rel: string): string {
  // In packaged app, extraResources land at process.resourcesPath/<rel>.
  // In dev, we map the same logical names to the monorepo source layout so
  // `pnpm start` Just Works without packaging.
  if (app.isPackaged) {
    return path.join(process.resourcesPath, rel);
  }
  // __dirname = apps/desktop/dist → repo root is 3 levels up.
  const repoRoot = path.join(__dirname, '..', '..', '..');
  switch (rel) {
    case 'web':
      return path.join(repoRoot, 'apps', 'web', '.next', 'standalone');
    case 'worker':
      return path.join(repoRoot, 'apps', 'worker', 'dist');
    case 'shared':
      return path.join(repoRoot, 'packages', 'shared', 'dist');
    case 'ffmpeg':
      // No bundled ffmpeg in dev — fall back to system PATH (`ffmpeg` from brew).
      return path.join(repoRoot, 'apps', 'desktop', 'vendor', 'ffmpeg');
    default:
      return path.join(repoRoot, rel);
  }
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

// Bundled config. Anon key is designed to be exposed (RLS enforces auth).
// Service role key + encryption key are needed by API routes that:
//   - encrypt cookies stored in `accounts` table (AES-256-GCM)
//   - admin endpoints that bypass RLS to list all users
// They are bundled here so packaged exe works without .env on user machines.
// Risk: anyone unpacking the asar can extract them — acceptable for current
// internal-use scope.
const RUNTIME_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://ogcsrvdfxtxcpaogplph.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    'sb_publishable_whdqQ22dJXtZfIs1nxcliw_vq3qQ7sw',
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_Dd3Z-AxtnhQLUM_Ge1Au2A_AOuBDp3m',
  SUPABASE_STORAGE_BUCKET: 'media',
  ENCRYPTION_KEY:
    '6af4c1daf0ecd35176810c3457aa8b8f1a4583a04881235d3ca198866bdd3de3',
};

async function startEmbeddedServer(): Promise<string> {
  const port = await findOpenPort();
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
    ...RUNTIME_ENV,
  });

  // Worker — long-lived background process.
  const workerEntry = path.join(resolveResource('worker'), 'index.js');
  if (fs.existsSync(workerEntry)) {
    const bravePath = detectBraveExe();
    // Build a node_modules-shaped folder pointer so worker dist can resolve
    // `@veo-farm/shared` even though it isn't a real npm dep of apps/desktop.
    // We synthesise the layout at boot if it doesn't exist yet.
    const sharedDistDir = resolveResource('shared');
    const synthNodeModules = path.join(app.getPath('userData'), 'node_modules');
    try {
      const sharedLink = path.join(synthNodeModules, '@veo-farm', 'shared');
      if (fs.existsSync(sharedDistDir)) {
        fs.mkdirSync(path.dirname(sharedLink), { recursive: true });
        // Mirror the package.json + dist layout so Node sees a valid module.
        fs.rmSync(sharedLink, { recursive: true, force: true });
        fs.mkdirSync(sharedLink, { recursive: true });
        fs.cpSync(sharedDistDir, path.join(sharedLink, 'dist'), { recursive: true });
        fs.writeFileSync(
          path.join(sharedLink, 'package.json'),
          JSON.stringify({
            name: '@veo-farm/shared',
            version: '0.1.0',
            main: './dist/index.js',
          }),
        );
      }
    } catch (e) {
      log.warn('synth @veo-farm/shared failed', (e as Error).message);
    }
    spawnChild('worker', process.execPath, [workerEntry], {
      ELECTRON_RUN_AS_NODE: '1',
      // NODE_PATH lets worker `require('@veo-farm/shared')` find the
      // synthesised module above without modifying its source.
      NODE_PATH: synthNodeModules,
      ...RUNTIME_ENV,
      ...(bravePath ? { BRAVE_PATH: bravePath } : {}),
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

  // Tag the initial URL with ?updated=<from>→<to> when a fresh install was
  // just completed by the auto-updater so the renderer can show a "remember
  // to save your workflow" banner.
  const updateInfo = detectJustUpdated();
  let loadUrl = url;
  if (updateInfo.updated) {
    const params = new URLSearchParams({
      updated: '1',
      from: updateInfo.from ?? '',
      to: updateInfo.to,
    });
    loadUrl = `${url}/?${params.toString()}`;
    log.info('app launched after update', updateInfo);
  }
  mainWindow.loadURL(loadUrl);
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
  // Auto-install when the user quits the app — guarantees no in-progress
  // canvas state is lost. If they never quit we still nudge them via the
  // toast below.
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    log.info('update-available', info?.version);
  });

  // Update is fully downloaded but we DON'T quit immediately — the user may
  // be mid-edit on an unsaved workflow. Instead show a non-modal notification:
  // "ready to install on next quit" with an optional 'Restart now' button.
  // The actual install happens automatically when the user Cmd+Q's the app
  // (autoInstallOnAppQuit above).
  autoUpdater.on('update-downloaded', async (info) => {
    log.info('update-downloaded', info?.version, '→ deferred install');
    if (!mainWindow) return;
    // Native macOS/Windows notification — appears in corner, doesn't block.
    try {
      const { Notification } = await import('electron');
      if (Notification.isSupported()) {
        const n = new Notification({
          title: `Veo Farm — bản v${info?.version} đã tải xong`,
          body: 'Sẽ tự cài khi bạn đóng app. Bấm để cài ngay (LƯU workflow trước!).',
        });
        n.on('click', async () => {
          if (!mainWindow) return autoUpdater.quitAndInstall(true, true);
          const res = await dialog.showMessageBox(mainWindow, {
            type: 'warning',
            title: 'Restart để cập nhật?',
            message: `App sẽ đóng và cài v${info?.version} ngay.`,
            detail:
              'Mọi workflow CHƯA bấm "Lưu" sẽ MẤT. Hãy chắc chắn đã lưu trước khi bấm Restart.',
            buttons: ['Restart ngay', 'Để khi đóng app'],
            defaultId: 1,
            cancelId: 1,
          });
          if (res.response === 0) autoUpdater.quitAndInstall(true, true);
        });
        n.show();
      }
    } catch (e) {
      log.warn('notification failed', (e as Error).message);
    }
  });
  autoUpdater.on('error', (err) => log.error('updater error', err));

  // First check on launch + every 30 min so users get fixes faster.
  autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  setInterval(() => autoUpdater.checkForUpdatesAndNotify().catch(() => {}), 30 * 60 * 1000);
}

// Compare the current app version against the last version we recorded on
// disk. If they differ → user just survived an auto-update → tell the
// renderer via a query param so it can show "remember to save your workflow".
function detectJustUpdated(): { updated: boolean; from?: string; to: string } {
  const versionFile = path.join(app.getPath('userData'), 'last-version.txt');
  const current = app.getVersion();
  let prev: string | undefined;
  try {
    if (fs.existsSync(versionFile)) prev = fs.readFileSync(versionFile, 'utf8').trim();
  } catch {
    /* ignore */
  }
  try {
    fs.writeFileSync(versionFile, current);
  } catch (e) {
    log.warn('cannot persist last-version.txt', (e as Error).message);
  }
  return { updated: !!prev && prev !== current, from: prev, to: current };
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
