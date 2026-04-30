import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ffmpeg from 'fluent-ffmpeg';
import type { VideoOutput, VoiceOutput } from '@veo-farm/shared';
import { downloadFromUrl, uploadBuffer } from '../core/storage.js';
import { logger } from '../core/logger.js';

interface ConcatArgs {
  userId: string;
  jobId: string;
  videos: VideoOutput[];
  voices: VoiceOutput[] | null;
  transition: 'cut' | 'fade' | 'dissolve';
  bgMusicUrl: string | null;
  addCaption: boolean;
}

export async function runConcat(args: ConcatArgs): Promise<string> {
  const work = await fs.mkdtemp(path.join(tmpdir(), 'veo-concat-'));
  try {
    // Download all videos
    const videoFiles: string[] = [];
    for (let i = 0; i < args.videos.length; i++) {
      const buf = await downloadFromUrl(args.videos[i].videoUrl);
      const f = path.join(work, `v${i}.mp4`);
      await fs.writeFile(f, buf);
      videoFiles.push(f);
    }

    // If user provided per-scene voices: replace audio per clip first
    const finalClips: string[] = [];
    if (args.voices && args.voices.length === videoFiles.length) {
      for (let i = 0; i < videoFiles.length; i++) {
        const voiceBuf = await downloadFromUrl(args.voices[i].audioUrl);
        const vf = path.join(work, `voice${i}.mp3`);
        await fs.writeFile(vf, voiceBuf);
        const out = path.join(work, `clip${i}.mp4`);
        await runFfmpeg((cmd) =>
          cmd
            .input(videoFiles[i])
            .input(vf)
            .outputOptions(['-c:v copy', '-c:a aac', '-shortest', '-map 0:v:0', '-map 1:a:0'])
            .output(out),
        );
        finalClips.push(out);
      }
    } else {
      finalClips.push(...videoFiles);
    }

    // Concat via demuxer
    const listFile = path.join(work, 'list.txt');
    await fs.writeFile(listFile, finalClips.map((f) => `file '${f}'`).join('\n'));
    const concatOut = path.join(work, 'concat.mp4');
    await runFfmpeg((cmd) =>
      cmd
        .input(listFile)
        .inputOptions(['-f concat', '-safe 0'])
        .outputOptions(['-c copy'])
        .output(concatOut),
    );

    // Background music mixing (optional)
    let withMusic = concatOut;
    if (args.bgMusicUrl) {
      const musicBuf = await downloadFromUrl(args.bgMusicUrl);
      const musicFile = path.join(work, 'bg.mp3');
      await fs.writeFile(musicFile, musicBuf);
      withMusic = path.join(work, 'with_music.mp4');
      await runFfmpeg((cmd) =>
        cmd
          .input(concatOut)
          .input(musicFile)
          .complexFilter([
            '[1:a]volume=0.15[a1]',
            '[0:a][a1]amix=inputs=2:duration=first:dropout_transition=2[aout]',
          ])
          .outputOptions(['-map 0:v:0', '-map [aout]', '-c:v copy', '-c:a aac'])
          .output(withMusic),
      );
    }

    // Captions (optional)
    let final = withMusic;
    if (args.addCaption) {
      try {
        const srt = await transcribeToSrt(withMusic, work);
        if (srt) {
          final = path.join(work, 'final.mp4');
          await runFfmpeg((cmd) =>
            cmd
              .input(withMusic)
              .videoFilters(`subtitles=${srt.replace(/'/g, "\\'")}:force_style='Fontsize=18,PrimaryColour=&Hffffff,OutlineColour=&H000000,BorderStyle=3,Outline=1,Shadow=0,Alignment=2'`)
              .outputOptions(['-c:a copy'])
              .output(final),
          );
        }
      } catch (e) {
        logger.warn({ err: String(e) }, 'concat: caption step failed, skipping');
      }
    }

    const buf = await fs.readFile(final);
    return await uploadBuffer(args.userId, args.jobId, buf, 'mp4');
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

function runFfmpeg(setup: (cmd: ffmpeg.FfmpegCommand) => ffmpeg.FfmpegCommand): Promise<void> {
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg();
    setup(cmd)
      .on('error', (err) => reject(err))
      .on('end', () => resolve())
      .run();
  });
}

// Best-effort caption: use whisper.cpp Node binding if available; otherwise skip.
async function transcribeToSrt(_videoFile: string, _workDir: string): Promise<string | null> {
  // TODO: integrate `nodejs-whisper` or `whisper.cpp` binary call.
  // Returning null disables captions gracefully until whisper is wired up at deploy time.
  return null;
}
