// tsc only emits .ts → .js. Static files (Chrome extension manifest, html,
// css, png) needed by the captcha bridge must be copied next to the compiled
// modules so token-manager.ts can `path.resolve(__dirname,
// '../captcha-server/extension')` at runtime.

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const STATIC_DIRS = [
  // Chrome extension loaded by Brave puppeteer.
  ['src/captcha-server/extension', 'dist/captcha-server/extension'],
  // Captcha-server static assets (cert + html).
  ['src/captcha-server/public', 'dist/captcha-server/public'],
];

const STATIC_FILES = [
  // Self-signed cert generator output gets persisted to disk at first run,
  // but the captcha-server source includes a default key/cert pair we need
  // bundled too if present.
  ['src/captcha-server/cert.pem', 'dist/captcha-server/cert.pem'],
  ['src/captcha-server/key.pem', 'dist/captcha-server/key.pem'],
];

function copyDir(rel) {
  const src = path.join(root, rel[0]);
  const dst = path.join(root, rel[1]);
  if (!fs.existsSync(src)) return;
  fs.rmSync(dst, { recursive: true, force: true });
  fs.cpSync(src, dst, { recursive: true });
  console.log(`[copy-static-assets] ✓ dir ${rel[0]} → ${rel[1]}`);
}

function copyFile(rel) {
  const src = path.join(root, rel[0]);
  const dst = path.join(root, rel[1]);
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  console.log(`[copy-static-assets] ✓ file ${rel[0]} → ${rel[1]}`);
}

for (const r of STATIC_DIRS) copyDir(r);
for (const r of STATIC_FILES) copyFile(r);
