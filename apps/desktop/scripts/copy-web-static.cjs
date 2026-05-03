// Next standalone build only emits server.js + node_modules. The static
// chunks (.next/static) and public/ assets must be copied next to the
// standalone server manually so the embedded server can serve CSS/JS/images.
// electron-builder's extraResources rule does this for the packaged exe; this
// script does the same thing for `pnpm start` dev runs on macOS.

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const standalone = path.join(repoRoot, 'apps', 'web', '.next', 'standalone', 'apps', 'web');
const staticSrc = path.join(repoRoot, 'apps', 'web', '.next', 'static');
const staticDst = path.join(standalone, '.next', 'static');
const publicSrc = path.join(repoRoot, 'apps', 'web', 'public');
const publicDst = path.join(standalone, 'public');

function copyRecursive(src, dst) {
  if (!fs.existsSync(src)) return false;
  fs.rmSync(dst, { recursive: true, force: true });
  fs.cpSync(src, dst, { recursive: true });
  return true;
}

if (!fs.existsSync(standalone)) {
  console.error(`[copy-web-static] standalone build not found at ${standalone}`);
  process.exit(1);
}
if (copyRecursive(staticSrc, staticDst)) {
  console.log(`[copy-web-static] ✓ static → ${staticDst}`);
} else {
  console.warn(`[copy-web-static] no static dir found at ${staticSrc}`);
}
if (copyRecursive(publicSrc, publicDst)) {
  console.log(`[copy-web-static] ✓ public → ${publicDst}`);
} else {
  console.log('[copy-web-static] (no public/ dir, skipping)');
}
