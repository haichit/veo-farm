// Builder Canvas — extract_last_frame node executor.
// Pulls the last frame of an upstream video as a JPEG image, so it can feed
// the "Start Frame" port of a downstream Generate Video node — chains scene
// N+1 to start exactly where scene N's video left off. Reuses the same
// ffmpeg-based extractor the legacy MVP-1 "chainFrames" video-render mode
// already relies on (core/last-frame.ts).

import { extractLastFrame } from '../../core/last-frame.js';
import { uploadBuffer } from '../../core/storage.js';
import { logger } from '../../core/logger.js';

export interface ExtractLastFrameNodeInput {
  videoUrls: string[];
  userId: string;
  jobId: string;
}

export interface ExtractLastFrameNodeOutput {
  media: Array<{ url: string; kind: 'image' }>;
}

export async function runExtractLastFrameNode(
  input: ExtractLastFrameNodeInput,
): Promise<ExtractLastFrameNodeOutput> {
  if (!input.videoUrls || input.videoUrls.length === 0) {
    throw new Error('extract_last_frame: no upstream video connected');
  }
  const out: Array<{ url: string; kind: 'image' }> = [];
  for (let i = 0; i < input.videoUrls.length; i++) {
    const frame = await extractLastFrame(input.videoUrls[i]);
    const url = await uploadBuffer(input.userId, input.jobId, frame, 'jpg');
    out.push({ url, kind: 'image' });
    logger.info({ idx: i }, 'extract_last_frame: frame done');
  }
  return { media: out };
}
