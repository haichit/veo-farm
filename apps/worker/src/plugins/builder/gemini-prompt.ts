// Builder Canvas — gemini_prompt node executor.
// Calls the public Gemini API (https://generativelanguage.googleapis.com)
// with the node's prompt template + upstream text. Returns the generated
// text so a downstream Generate Image / Generate Video node can use the
// expanded/refined prompt.
//
// Auth: per-node API key (paste from aistudio.google.com/apikey).
// Free tier: 15 requests/min — plenty for personal use.

import { logger } from '../../core/logger.js';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export interface GeminiPromptNodeInput {
  /** Resolved upstream text (replaces {{text}} in the template). */
  text: string;
  config: {
    apiKey?: string;
    model?: string;
    promptTemplate?: string;
    useAdditionalText?: boolean;
    additionalText?: string;
  };
}

export interface GeminiPromptNodeOutput {
  text: string;
}

export async function runGeminiPromptNode(
  input: GeminiPromptNodeInput,
): Promise<GeminiPromptNodeOutput> {
  const apiKey = input.config.apiKey?.trim();
  if (!apiKey) {
    throw new Error(
      'gemini_prompt: API Key chưa cài. Mở editor panel và paste key từ aistudio.google.com/apikey',
    );
  }

  const model = input.config.model?.trim() || 'gemini-2.5-flash';
  const tmpl = input.config.promptTemplate?.trim() || '{{text}}';
  // Replace placeholder with upstream text. If template has no placeholder
  // but upstream has text, append it (keeps single-shot prompts useful).
  let userPrompt = tmpl.includes('{{text}}')
    ? tmpl.replace(/\{\{text\}\}/g, input.text ?? '')
    : (tmpl + (input.text ? `\n\n${input.text}` : '')).trim();

  if (input.config.useAdditionalText && input.config.additionalText?.trim()) {
    userPrompt += `\n\n${input.config.additionalText.trim()}`;
  }

  if (!userPrompt) {
    throw new Error('gemini_prompt: prompt rỗng (template + upstream text đều trống)');
  }

  const url = `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
  };

  logger.info({ model, len: userPrompt.length }, 'gemini_prompt: calling API');
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const errText = await r.text().catch(() => '');
    throw new Error(`gemini_prompt: API ${r.status}: ${errText.slice(0, 300)}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await r.json()) as any;
  const text =
    data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join('') ?? '';
  if (!text.trim()) {
    throw new Error(
      `gemini_prompt: empty response: ${JSON.stringify(data).slice(0, 300)}`,
    );
  }
  logger.info({ outLen: text.length }, 'gemini_prompt: complete');
  return { text: text.trim() };
}
