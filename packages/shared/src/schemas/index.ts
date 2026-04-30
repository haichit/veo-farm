import { z } from 'zod';

export const aspectRatioSchema = z.enum(['9:16', '16:9', '1:1']);

export const scriptSceneSchema = z.object({
  id: z.number().int(),
  duration_sec: z.number().positive(),
  image_prompt: z.string().min(1),
  video_prompt: z.string().min(1),
  voice_script: z.string(),
});

export const scriptOutputSchema = z.object({
  character_bible: z.object({
    name: z.string(),
    appearance: z.string(),
    personality: z.string(),
  }),
  scene_bible: z.object({
    setting: z.string(),
    visual_style: z.string(),
    camera: z.string(),
  }),
  scenes: z.array(scriptSceneSchema).min(1),
  audio: z.object({
    music_mood: z.string(),
    voice_style: z.string(),
  }),
  post: z.object({
    title: z.string(),
    caption: z.string(),
    hashtags: z.array(z.string()),
  }),
});

export const imageOutputSchema = z.object({
  imageUrl: z.string().url(),
  mimeType: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export const videoOutputSchema = z.object({
  videoUrl: z.string().url(),
  durationSec: z.number().positive(),
  hasAudio: z.boolean(),
});

export const voiceOutputSchema = z.object({
  audioUrl: z.string().url(),
  durationSec: z.number().positive(),
});

export const cookieSchema = z.object({
  name: z.string(),
  value: z.string(),
  domain: z.string(),
  path: z.string(),
  expires: z.number().optional(),
  httpOnly: z.boolean().optional(),
  secure: z.boolean().optional(),
  sameSite: z.enum(['Strict', 'Lax', 'None']).optional(),
});

export const cookiesArraySchema = z.array(cookieSchema);

export const flowNodeSchema = z.object({
  id: z.string(),
  type: z.enum([
    'ideaInput',
    'scriptWriter',
    'imageGenerator',
    'videoRender',
    'voiceGen',
    'concat',
    'download',
  ]),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.record(z.unknown()),
});

export const flowEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().nullish(),
  targetHandle: z.string().nullish(),
});

export const flowGraphSchema = z.object({
  nodes: z.array(flowNodeSchema),
  edges: z.array(flowEdgeSchema),
});
