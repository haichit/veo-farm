import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';
import log from 'electron-log';
import { autoUpdater } from 'electron-updater';
import treeKill from 'tree-kill';

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

function killChildren(): Promise<void> {
  // tree-kill recurses into descendants — required on Windows because
  // child.kill() only signals the immediate child. Brave/puppeteer spawn
  // their own grandchildren that otherwise survive app.quit() and lock the
  // .exe file, breaking the auto-updater.
  return new Promise((resolve) => {
    if (children.length === 0) return resolve();
    let pending = children.length;
    const done = () => {
      pending -= 1;
      if (pending === 0) resolve();
    };
    for (const c of children) {
      if (!c.pid || c.exitCode !== null) {
        done();
        continue;
      }
      treeKill(c.pid, 'SIGKILL', (err) => {
        if (err) log.warn(`tree-kill pid=${c.pid} failed: ${err.message}`);
        done();
      });
    }
  });
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

// ─── Worker subprocess management ───────────────────────────────────────────

let currentWorkerUserId: string | null = null;
let workerChild: ChildProcess | null = null;

function ensureSharedPackageInWorkerNodeModules(workerDir: string): void {
  // Worker dist imports `@veo-farm/shared` (a workspace package not present
  // in apps/desktop's npm dependencies). Synthesise the package directly
  // INSIDE worker/node_modules so the ESM resolver finds it via the normal
  // node_modules walk from worker/core/logger.js (NODE_PATH does not work
  // for ESM in Node 18+).
  const sharedDistDir = resolveResource('shared');
  if (!fs.existsSync(sharedDistDir)) {
    log.warn(`shared dist dir missing at ${sharedDistDir} — workspace import will fail`);
    return;
  }
  try {
    const target = path.join(workerDir, 'node_modules', '@veo-farm', 'shared');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.rmSync(target, { recursive: true, force: true });
    fs.mkdirSync(target, { recursive: true });
    fs.cpSync(sharedDistDir, path.join(target, 'dist'), { recursive: true });
    fs.writeFileSync(
      path.join(target, 'package.json'),
      JSON.stringify({
        name: '@veo-farm/shared',
        version: '0.1.0',
        main: './dist/index.js',
      }),
    );
  } catch (e) {
    log.warn('synth @veo-farm/shared failed', (e as Error).message);
  }
}

function spawnWorker(userId: string | null) {
  // Kill the previous worker — its env is now stale.
  if (workerChild) {
    try {
      workerChild.kill();
    } catch {
      /* ignore */
    }
    workerChild = null;
  }

  const workerDir = resolveResource('worker');
  const workerEntry = path.join(workerDir, 'index.js');
  if (!fs.existsSync(workerEntry)) {
    log.warn(`worker entry not found at ${workerEntry} — skipping`);
    return;
  }
  const bravePath = detectBraveExe();
  ensureSharedPackageInWorkerNodeModules(workerDir);

  log.info('spawning worker', { userId: userId ?? '(none)', workerDir });
  const child = spawn(process.execPath, [workerEntry], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      ...RUNTIME_ENV,
      ...(bravePath ? { BRAVE_PATH: bravePath } : {}),
      FFMPEG_PATH: path.join(
        resolveResource('ffmpeg'),
        process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg',
      ),
      ...(userId ? { WORKER_USER_ID: userId } : {}),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (d) => log.info(`[worker] ${d.toString().trim()}`));
  child.stderr?.on('data', (d) => log.warn(`[worker] ${d.toString().trim()}`));
  child.on('exit', (code) => log.warn(`[worker] exited code=${code}`));
  workerChild = child;
  children.push(child);
}

// Start the captcha-server sidecar bundled alongside the worker. It listens
// on https://127.0.0.1:3456 (self-signed cert auto-generated into
// ~/.veo-farm-captcha-cert on first boot) and brokers reCAPTCHA Enterprise
// tokens between the worker and Brave's content-script extension.
function spawnCaptchaServer() {
  const workerDir = resolveResource('worker');
  const captchaEntry = path.join(workerDir, 'captcha-server', 'server.js');
  if (!fs.existsSync(captchaEntry)) {
    log.warn(`captcha-server entry not found at ${captchaEntry} — skipping`);
    return;
  }
  spawnChild('captcha', process.execPath, [captchaEntry], {
    ELECTRON_RUN_AS_NODE: '1',
    CAPTCHA_PORT: process.env.CAPTCHA_PORT ?? '3456',
    CAPTCHA_MODE: process.env.CAPTCHA_MODE ?? 'auto',
  });
}

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

  // Captcha-server is a sibling sidecar to the worker — Brave's extension
  // connects to it over Socket.IO to ask for a fresh reCAPTCHA Enterprise
  // token whenever Google flags the request as UNUSUAL_ACTIVITY. Without it,
  // the rotate path fails with `ECONNREFUSED 127.0.0.1:3456` and any video
  // gen that triggers anti-bot escalates into a hard error.
  spawnCaptchaServer();

  // Worker spawned later — once the renderer signals which user is logged in
  // (see ipcMain.handle('vf:set-user') below). Worker stays idle until then,
  // which is fine because no jobs can be created without a logged-in user.
  spawnWorker(currentWorkerUserId);

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
      preload: path.join(__dirname, 'preload.js'),
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

  // Brave detection — Win: offer 1-tap auto-install. Other OSes: link out.
  if (!detectBraveExe()) {
    void ensureBrave();
  }
}

// On Windows, download + run Brave's standalone installer silently. The
// extension Veo Farm needs is bundled inside the worker dist; user only
// needs the Brave binary itself.
async function ensureBrave(): Promise<void> {
  if (!mainWindow) return;
  if (process.platform !== 'win32') {
    const res = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'Cần cài Brave Browser',
      message: 'Veo Farm cần Brave Browser để render video. Mở trang download?',
      buttons: ['Mở trang Brave', 'Bỏ qua'],
      defaultId: 0,
    });
    if (res.response === 0) shell.openExternal('https://brave.com/download/');
    return;
  }
  const res = await dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Cần cài Brave Browser',
    message: 'Veo Farm cần Brave (~200MB) để render video.',
    detail:
      'Bấm "Cài tự động" để Veo Farm tải + cài Brave nền (mất 2-5 phút tùy mạng). Bạn vẫn dùng app được trong lúc đợi.',
    buttons: ['Cài tự động', 'Để sau'],
    defaultId: 0,
    cancelId: 1,
  });
  if (res.response !== 0) return;

  try {
    const tmpInstaller = path.join(app.getPath('temp'), `BraveSetup-${Date.now()}.exe`);
    log.info(`downloading Brave installer → ${tmpInstaller}`);
    // Stable standalone installer URL — Brave maintains a permanent redirect.
    await downloadFile('https://laptop-updates.brave.com/latest/winx64', tmpInstaller);
    log.info('running Brave installer (silent)');
    // /silent flag = no UI; Brave NSIS installer respects it.
    const child = spawn(tmpInstaller, ['/silent'], { detached: true, stdio: 'ignore' });
    child.unref();
    // Poll every 5s for up to 10 minutes for Brave to appear.
    const deadline = Date.now() + 10 * 60 * 1000;
    while (Date.now() < deadline) {
      await sleep(5000);
      if (detectBraveExe()) {
        if (mainWindow) {
          await dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Brave đã cài xong',
            message: 'Veo Farm có thể render video ngay bây giờ.',
            buttons: ['OK'],
          });
        }
        return;
      }
    }
    if (mainWindow) {
      await dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'Cài Brave thất bại',
        message:
          'Veo Farm không phát hiện Brave sau 10 phút. Cài thủ công tại brave.com/download.',
        buttons: ['Mở trang Brave', 'Đóng'],
      });
    }
  } catch (e) {
    log.error('Brave auto-install failed', e);
    if (mainWindow) {
      await dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'Lỗi tải Brave',
        message: `Không tải được Brave: ${(e as Error).message}\n\nCài thủ công tại brave.com/download.`,
      });
    }
  }
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const https = require('node:https') as typeof import('node:https');
    const file = fs.createWriteStream(dest);
    function get(u: string, redirects = 0) {
      if (redirects > 10) return reject(new Error('too many redirects'));
      https
        .get(u, (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            return get(res.headers.location, redirects + 1);
          }
          if (res.statusCode !== 200) {
            return reject(new Error(`HTTP ${res.statusCode} from ${u}`));
          }
          res.pipe(file);
          file.on('finish', () => file.close((err) => (err ? reject(err) : resolve())));
        })
        .on('error', reject);
    }
    get(url);
  });
}

// ─── Auto-update ────────────────────────────────────────────────────────────

// State machine the renderer reads via IPC. Drives the in-app UpdateBadge
// (top-right, next to the worker connection chip).
type UpdateState =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string }
  | { state: 'not-supported' };

let updateState: UpdateState = app.isPackaged
  ? { state: 'idle' }
  : { state: 'not-supported' };

function setUpdateState(next: UpdateState) {
  updateState = next;
  try {
    mainWindow?.webContents.send('vf:update-event', updateState);
  } catch (e) {
    log.warn('forward update event failed', (e as Error).message);
  }
}

function setupAutoUpdate() {
  if (!app.isPackaged) {
    log.info('skip auto-update (dev mode)');
    return;
  }
  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  // The UI button drives install timing — we still flip this on as a
  // safety net so a forgotten window-close still installs the queued update.
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => setUpdateState({ state: 'checking' }));
  autoUpdater.on('update-available', (info) => {
    log.info('update-available', info?.version);
    setUpdateState({ state: 'downloading', version: info?.version ?? '', percent: 0 });
  });
  autoUpdater.on('update-not-available', () => setUpdateState({ state: 'idle' }));
  autoUpdater.on('download-progress', (p) => {
    if (updateState.state === 'downloading') {
      setUpdateState({
        state: 'downloading',
        version: updateState.version,
        percent: Math.round(p.percent ?? 0),
      });
    }
  });
  autoUpdater.on('update-downloaded', (info) => {
    log.info('update-downloaded', info?.version, '→ awaiting user click in UpdateBadge');
    setUpdateState({ state: 'downloaded', version: info?.version ?? '' });
  });
  autoUpdater.on('error', (err) => {
    log.error('updater error', err);
    setUpdateState({ state: 'error', message: err?.message ?? String(err) });
  });

  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 30 * 60 * 1000);
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

// Renderer → main: tell us who is logged in. We respawn the worker subprocess
// with WORKER_USER_ID set so it only claims jobs owned by this user. Called
// once on layout mount; no-op if the user hasn't changed.
ipcMain.handle('vf:set-user', (_evt, userId: string | null) => {
  if (currentWorkerUserId === userId) return { ok: true, changed: false };
  currentWorkerUserId = userId;
  spawnWorker(userId);
  return { ok: true, changed: true };
});

ipcMain.handle('vf:get-version', () => app.getVersion());
ipcMain.handle('vf:update-status', () => updateState);
ipcMain.handle('vf:update-check', async () => {
  if (!app.isPackaged) return { ok: false, reason: 'dev-mode' };
  try {
    await autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
});
ipcMain.handle('vf:update-install', async () => {
  if (!app.isPackaged) return { ok: false, reason: 'dev-mode' };
  if (updateState.state !== 'downloaded') {
    return { ok: false, reason: `state=${updateState.state}` };
  }
  const v = updateState.version;
  // OS-level notification — survives the main window closing so the user
  // still sees install progress while electron-updater extracts files.
  // We can't show a real progress bar (NSIS silent install gives no
  // events), so the message is informational ("running ~30-60s").
  try {
    const { Notification } = await import('electron');
    if (Notification.isSupported()) {
      new Notification({
        title: `Veo Farm — đang cài v${v}`,
        body: 'App sẽ tự mở lại sau ~30-60 giây. Đừng tắt máy.',
        silent: false,
      }).show();
    }
  } catch (e) {
    log.warn('install notification failed', (e as Error).message);
  }
  // 1.5s grace lets the renderer paint the in-app spinner + the OS
  // notification render before the window vanishes. quitAndInstall fires
  // before-quit which tree-kills children + waits 600ms before app.quit,
  // so there's no .exe lock when the installer starts.
  setTimeout(() => autoUpdater.quitAndInstall(true, true), 1500);
  return { ok: true };
});

app.whenReady().then(() => {
  createWindow();
  setupAutoUpdate();
});

// Win: kill child tree synchronously on close so the auto-updater's
// installer doesn't see locked .exe files. Mac: dock keeps app alive,
// don't quit on last window — match Electron defaults.
let isQuitting = false;
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', (e) => {
  if (isQuitting) return;
  e.preventDefault();
  isQuitting = true;
  killChildren()
    .catch((err) => log.warn('killChildren error', err))
    .finally(() => {
      // Brief grace period so OS finishes reaping the killed PIDs before
      // the installer starts. 600ms is plenty in practice.
      setTimeout(() => app.quit(), 600);
    });
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
