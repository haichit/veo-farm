import type { FlowGraph } from '@veo-farm/shared';

export const DEFAULT_SYSTEM_PROMPT = `Bạn là director sản xuất video ngắn 60s cho TikTok / Reels.
Trả về JSON đúng schema, KHÔNG kèm markdown fence nếu được yêu cầu raw.
Schema:
{
  "character_bible": { "name": string, "appearance": string, "personality": string },
  "scene_bible": { "setting": string, "visual_style": string, "camera": string },
  "scenes": [
    { "id": 1, "duration_sec": 8, "image_prompt": "...", "video_prompt": "...", "voice_script": "..." },
    ... 8 scenes total
  ],
  "audio": { "music_mood": string, "voice_style": string },
  "post": { "title": string, "caption": string, "hashtags": [string] }
}
Mỗi scene 8 giây. Tổng 8 scene = 64s. image_prompt mô tả cảnh tĩnh đẹp, video_prompt mô tả chuyển động, voice_script là 1-2 câu tiếng Việt.`;

export function defaultFlowGraph(): FlowGraph {
  return {
    nodes: [
      {
        id: 'idea',
        type: 'ideaInput',
        position: { x: 0, y: 200 },
        data: { label: 'Idea', value: '' },
      },
      {
        id: 'script',
        type: 'scriptWriter',
        position: { x: 280, y: 200 },
        data: {
          provider: 'chatgpt',
          config: { system_prompt: DEFAULT_SYSTEM_PROMPT },
        },
      },
      {
        id: 'image',
        type: 'imageGenerator',
        position: { x: 600, y: 100 },
        data: { provider: 'flux', concurrency: 'auto' },
      },
      {
        id: 'video',
        type: 'videoRender',
        position: { x: 920, y: 200 },
        data: { provider: 'veo3', concurrency: 'auto' },
      },
      {
        id: 'voice',
        type: 'voiceGen',
        position: { x: 600, y: 320 },
        data: { provider: 'veo_native', config: { voice_id: 'default' } },
      },
      {
        id: 'concat',
        type: 'concat',
        position: { x: 1240, y: 200 },
        data: {
          config: { transition: 'fade', music_url: null, add_caption: true },
        },
      },
      {
        id: 'download',
        type: 'download',
        position: { x: 1560, y: 200 },
        data: {},
      },
    ],
    edges: [
      { id: 'e1', source: 'idea', target: 'script' },
      { id: 'e2', source: 'script', target: 'image' },
      { id: 'e3', source: 'script', target: 'voice' },
      { id: 'e4', source: 'script', target: 'video' },
      { id: 'e5', source: 'image', target: 'video' },
      { id: 'e6', source: 'video', target: 'concat' },
      { id: 'e7', source: 'voice', target: 'concat' },
      { id: 'e8', source: 'concat', target: 'download' },
    ],
  };
}
