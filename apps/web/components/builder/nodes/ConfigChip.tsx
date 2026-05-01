'use client';

import { ChevronDown, Check } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface OptionItem<T extends string | number> {
  value: T;
  label: string;
  subtitle?: string;
}

interface ConfigChipProps<T extends string | number> {
  value: T;
  options: OptionItem<T>[];
  onChange: (value: T) => void;
  format?: (value: T) => string;
}

export function ConfigChip<T extends string | number>({
  value,
  options,
  onChange,
  format,
}: ConfigChipProps<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const display = format ? format(value) : (selected?.label ?? String(value));

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onMouseDown={(e) => e.stopPropagation()}
        className="nodrag inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.08] text-[#d4d4d4] text-[10px] font-medium hover:bg-white/[0.08] hover:border-white/[0.15] transition-all"
      >
        {display}
        <ChevronDown size={8} className="opacity-60" />
      </button>
      {open && (
        <div
          className="nodrag absolute top-full left-0 mt-1 z-50 min-w-[160px] rounded-md py-1 bg-bg-card border border-border shadow-lg"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {options.map((opt) => (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-bg-card-hover transition-colors ${
                opt.value === value ? 'text-accent' : 'text-text-secondary'
              }`}
            >
              <div className="flex items-center gap-1.5">
                {opt.value === value && <Check size={10} className="text-accent" />}
                <span className={opt.value === value ? '' : 'ml-3.5'}>{opt.label}</span>
              </div>
              {opt.subtitle && (
                <div className="text-[9px] text-text-muted ml-3.5 mt-0.5">{opt.subtitle}</div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
