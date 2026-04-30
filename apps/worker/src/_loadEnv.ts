import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Load /<repo>/.env without adding a runtime dep.
const here = dirname(fileURLToPath(import.meta.url));
const candidates = [
  resolve(here, '../../../.env'),
  resolve(here, '../../.env'),
  resolve(here, '../.env'),
];

for (const p of candidates) {
  try {
    const text = readFileSync(p, 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2];
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
    console.log(`[env] loaded ${p}`);
    break;
  } catch {
    // try next
  }
}
