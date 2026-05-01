'use client';

import { useState } from 'react';
import {
  Lightbulb,
  PenLine,
  ImageIcon,
  Film,
  Mic,
  Combine,
  Download,
  Plus,
  X,
} from 'lucide-react';

const NODE_TYPES = [
  { type: 'ideaInput', label: 'Idea', icon: Lightbulb, defaultData: { label: 'Idea', value: '' } },
  {
    type: 'scriptWriter',
    label: 'Script Writer',
    icon: PenLine,
    defaultData: { provider: 'claude', config: {} },
  },
  {
    type: 'imageGenerator',
    label: 'Image Generator',
    icon: ImageIcon,
    defaultData: { provider: 'flux', concurrency: 'auto' },
  },
  {
    type: 'videoRender',
    label: 'Video Render',
    icon: Film,
    defaultData: { provider: 'veo3', concurrency: 'auto' },
  },
  {
    type: 'voiceGen',
    label: 'Voice Gen',
    icon: Mic,
    defaultData: { provider: 'veo_native', config: { voice_id: 'default' } },
  },
  {
    type: 'concat',
    label: 'Concat',
    icon: Combine,
    defaultData: { config: { transition: 'fade', music_url: null, add_caption: true } },
  },
  { type: 'download', label: 'Download', icon: Download, defaultData: {} },
] as const;

interface NodePaletteProps {
  onAdd: (type: string, data: Record<string, unknown>) => void;
}

export function NodePalette({ onAdd }: NodePaletteProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Floating "+" button bottom-right */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="absolute bottom-6 right-20 z-20 w-12 h-12 rounded-full
                   bg-gradient-to-br from-accent to-accent-hover text-white
                   shadow-accent-glow hover:shadow-accent-glow-lg hover:-translate-y-0.5
                   transition-all flex items-center justify-center"
        aria-label="Add node"
        title="Add node"
      >
        {open ? <X className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
      </button>

      {open && (
        <div
          className="absolute bottom-22 right-20 z-20 w-64 bg-glass backdrop-blur-glass
                     border border-glass-border rounded-2xl shadow-glass overflow-hidden"
          style={{ bottom: '5.5rem' }}
        >
          <div className="px-4 py-2.5 border-b border-border">
            <div className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Add node
            </div>
          </div>
          <div className="p-1.5 max-h-[60vh] overflow-y-auto">
            {NODE_TYPES.map((nt) => {
              const Icon = nt.icon;
              return (
                <button
                  key={nt.type}
                  type="button"
                  onClick={() => {
                    onAdd(nt.type, { ...nt.defaultData });
                    setOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg
                             text-left text-sm text-text-secondary
                             hover:bg-white/[0.04] hover:text-text-primary transition-colors"
                >
                  <span className="w-7 h-7 rounded-lg bg-accent-glow flex items-center justify-center text-accent shrink-0">
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                  {nt.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
