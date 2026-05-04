export function getFfmpegPath(): string {
  return process.env.FFMPEG_PATH && process.env.FFMPEG_PATH.length > 0
    ? process.env.FFMPEG_PATH
    : 'ffmpeg';
}
