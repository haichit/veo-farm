#!/usr/bin/env node
// Self-test cho logic core (no browser, no DB).
// Run: node apps/web/scripts/self-test.mjs

import { strict as assert } from 'node:assert';
import crypto from 'node:crypto';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ✗ ${name}\n    ${err.message}`);
    failed++;
  }
}

// ===== 1. Cookie normalize (Cookie-Editor → Playwright format) =====
console.log('\n[normalizeCookies]');

function normalizeSameSite(s) {
  if (!s) return undefined;
  const v = s.toLowerCase();
  if (v === 'strict') return 'Strict';
  if (v === 'lax' || v === 'unspecified' || v === 'no_restriction') return 'Lax';
  if (v === 'none') return 'None';
  return 'Lax';
}
function normalizeCookies(raw) {
  if (!Array.isArray(raw)) return raw;
  return raw.map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path ?? '/',
    expires: c.expires ?? c.expirationDate,
    httpOnly: c.httpOnly,
    secure: c.secure,
    sameSite: normalizeSameSite(c.sameSite),
  }));
}

test('Cookie-Editor format → Playwright format', () => {
  const input = [{
    name: 'oai-did',
    value: '703e3878',
    domain: '.chatgpt.com',
    path: '/',
    expirationDate: 1803280977.808382,
    hostOnly: false,
    httpOnly: false,
    sameSite: 'lax',
    secure: false,
    session: false,
    storeId: null,
  }];
  const out = normalizeCookies(input);
  assert.equal(out[0].name, 'oai-did');
  assert.equal(out[0].sameSite, 'Lax');
  assert.equal(out[0].expires, 1803280977.808382);
  assert.ok(!('hostOnly' in out[0]));
  assert.ok(!('storeId' in out[0]));
});

test('sameSite "no_restriction" maps to Lax', () => {
  assert.equal(normalizeSameSite('no_restriction'), 'Lax');
});
test('sameSite "none" maps to None', () => {
  assert.equal(normalizeSameSite('none'), 'None');
});
test('sameSite "STRICT" maps to Strict', () => {
  assert.equal(normalizeSameSite('STRICT'), 'Strict');
});

// ===== 2. AES-256-GCM encrypt/decrypt =====
console.log('\n[encryption]');

const ALG = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const key = crypto.randomBytes(32);

function encrypt(plaintext) {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALG, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}
function decrypt(b64) {
  const buf = Buffer.from(b64, 'base64');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

test('encrypt → decrypt roundtrip', () => {
  const text = JSON.stringify([{ name: 'a', value: 'b'.repeat(500) }]);
  const enc = encrypt(text);
  assert.equal(decrypt(enc), text);
});
test('different ciphertexts for same plaintext (IV)', () => {
  const a = encrypt('hello');
  const b = encrypt('hello');
  assert.notEqual(a, b);
});
test('tampered ciphertext throws', () => {
  const enc = encrypt('hello');
  const buf = Buffer.from(enc, 'base64');
  buf[buf.length - 1] ^= 0xff;
  assert.throws(() => decrypt(buf.toString('base64')));
});

// ===== 3. Topological sort =====
console.log('\n[topologicalSort]');

function topologicalSort(graph) {
  const inDeg = new Map();
  const out = new Map();
  graph.nodes.forEach((n) => {
    inDeg.set(n.id, 0);
    out.set(n.id, []);
  });
  graph.edges.forEach((e) => {
    out.get(e.source)?.push(e.target);
    inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
  });
  const queue = [];
  inDeg.forEach((d, id) => d === 0 && queue.push(id));
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    out.get(id)?.forEach((t) => {
      const nd = (inDeg.get(t) ?? 0) - 1;
      inDeg.set(t, nd);
      if (nd === 0) queue.push(t);
    });
  }
  if (order.length !== graph.nodes.length) throw new Error('cycle');
  return order;
}

test('default flow ordering: idea → script → ... → download', () => {
  const g = {
    nodes: [
      { id: 'idea' }, { id: 'script' }, { id: 'image' }, { id: 'video' },
      { id: 'voice' }, { id: 'concat' }, { id: 'download' },
    ],
    edges: [
      { source: 'idea', target: 'script' },
      { source: 'script', target: 'image' },
      { source: 'script', target: 'voice' },
      { source: 'script', target: 'video' },
      { source: 'image', target: 'video' },
      { source: 'video', target: 'concat' },
      { source: 'voice', target: 'concat' },
      { source: 'concat', target: 'download' },
    ],
  };
  const order = topologicalSort(g);
  assert.equal(order[0], 'idea');
  assert.equal(order[order.length - 1], 'download');
  // script must come before image, voice, video
  assert.ok(order.indexOf('script') < order.indexOf('image'));
  assert.ok(order.indexOf('script') < order.indexOf('voice'));
  assert.ok(order.indexOf('image') < order.indexOf('video'));
  assert.ok(order.indexOf('video') < order.indexOf('concat'));
});

test('cycle detected', () => {
  const g = {
    nodes: [{ id: 'a' }, { id: 'b' }],
    edges: [{ source: 'a', target: 'b' }, { source: 'b', target: 'a' }],
  };
  assert.throws(() => topologicalSort(g), /cycle/);
});

// ===== 4. JSON extract =====
console.log('\n[parseScriptOutput / extractJsonBlock]');

function extractJsonBlock(text) {
  const fence = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  const candidate = fence ? fence[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON');
  return JSON.parse(candidate.slice(start, end + 1));
}

test('extracts from fenced markdown block', () => {
  const out = extractJsonBlock('Sure, here:\n```json\n{"a": 1}\n```\nthanks');
  assert.deepEqual(out, { a: 1 });
});
test('extracts raw JSON', () => {
  const out = extractJsonBlock('preamble {"a": 1, "b": [2,3]} trailing');
  assert.deepEqual(out, { a: 1, b: [2, 3] });
});
test('throws on no JSON', () => {
  assert.throws(() => extractJsonBlock('no json here'));
});

// ===== Summary =====
console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
