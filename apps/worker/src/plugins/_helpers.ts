import { schemas } from '@veo-farm/shared';
import JSON5 from 'json5';

export function extractJsonBlock(text: string): unknown {
  const candidates: string[] = [];

  // Fenced code block first
  const fence = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (fence) candidates.push(fence[1]);

  // Brute force: try parse from EACH `{` position to LAST `}`.
  // This handles weird preambles, ellipsis previews, mismatched chars.
  const lastClose = text.lastIndexOf('}');
  if (lastClose !== -1) {
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '{') {
        candidates.push(text.slice(i, lastClose + 1));
      }
    }
  }

  // Sort longest first to prefer the most complete match.
  candidates.sort((a, b) => b.length - a.length);

  let lastErr: unknown;
  for (const c of candidates) {
    for (const variant of [c, escapeControlInStrings(c)]) {
      try { return JSON.parse(variant); } catch (e) { lastErr = e; }
      try { return JSON5.parse(variant); } catch (e) { lastErr = e; }
    }
  }
  throw lastErr ?? new Error('No JSON object found in response');
}

// Walk through text. Inside string literals (between unescaped double-quotes),
// replace literal newline/tab/carriage with their JSON escape sequences.
function escapeControlInStrings(s: string): string {
  let out = '';
  let inStr = false;
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (escaped) {
        out += c;
        escaped = false;
        continue;
      }
      if (c === '\\') {
        out += c;
        escaped = true;
        continue;
      }
      if (c === '"') {
        out += c;
        inStr = false;
        continue;
      }
      // Inside string: escape control chars
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

export function parseScriptOutput(text: string) {
  const obj = extractJsonBlock(text);
  return schemas.scriptOutputSchema.parse(obj);
}
