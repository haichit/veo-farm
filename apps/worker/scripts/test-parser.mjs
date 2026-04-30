import JSON5 from 'json5';
import { readFileSync } from 'node:fs';

const text = readFileSync('/tmp/claude-raw.txt', 'utf8');

function escapeControlInStrings(s) {
  let out = '', inStr = false, escaped = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (escaped) { out += c; escaped = false; continue; }
      if (c === '\\') { out += c; escaped = true; continue; }
      if (c === '"') { out += c; inStr = false; continue; }
      if (c === '\n') out += '\\n';
      else if (c === '\r') out += '\\r';
      else if (c === '\t') out += '\\t';
      else out += c;
    } else {
      if (c === '"') inStr = true;
      out += c;
    }
  }
  return out;
}

function extract(text) {
  const candidates = [];
  const fence = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (fence) candidates.push(fence[1]);
  const lastClose = text.lastIndexOf('}');
  if (lastClose !== -1) {
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '{') candidates.push(text.slice(i, lastClose + 1));
    }
  }
  candidates.sort((a, b) => b.length - a.length);
  console.log(`${candidates.length} candidates`);
  for (const c of candidates) {
    for (const v of [c, escapeControlInStrings(c)]) {
      try { return { result: JSON.parse(v), parser: 'JSON', size: c.length }; } catch {}
      try { return { result: JSON5.parse(v), parser: 'JSON5', size: c.length }; } catch {}
    }
  }
  throw new Error('all failed');
}

const out = extract(text);
console.log(`PARSED via ${out.parser}, candidate size=${out.size}`);
console.log('name:', out.result.character_bible?.name);
console.log('setting:', out.result.scene_bible?.setting);
console.log('scenes count:', out.result.scenes?.length);
console.log('post.title:', out.result.post?.title);
