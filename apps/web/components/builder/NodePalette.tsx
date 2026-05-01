'use client';

import * as Icons from 'lucide-react';
import {
  CATEGORY_ORDER,
  NODE_CATEGORIES,
  nodesByCategory,
  type BuilderNodeType,
} from '@/lib/builder/node-types';

const DRAG_MIME = 'application/veofarm-node-type';

export function NodePalette() {
  function onDragStart(e: React.DragEvent, type: BuilderNodeType) {
    e.dataTransfer.setData(DRAG_MIME, type);
    e.dataTransfer.effectAllowed = 'copy';
  }

  return (
    <div className="p-3 border-b border-border">
      <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-2.5">
        Nodes
      </div>

      {CATEGORY_ORDER.map((catKey) => {
        const items = nodesByCategory(catKey);
        if (items.length === 0) return null;
        return (
          <div key={catKey} className="mb-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">
              {NODE_CATEGORIES[catKey]}
            </div>
            {items.map((item) => {
              // eslint-disable-next-line
              const Icon = ((Icons as any)[item.icon] ?? Icons.Box) as Icons.LucideIcon;
              return (
                <div
                  key={item.type}
                  draggable
                  onDragStart={(e) => onDragStart(e, item.type)}
                  className="flex items-center gap-2 py-1.5 px-2.5 rounded-md bg-bg-card border border-border mb-1 cursor-grab text-xs font-medium text-text-secondary hover:bg-bg-card-hover hover:text-text-primary hover:border-glass-border hover:translate-x-0.5 active:cursor-grabbing active:opacity-70 transition-all select-none"
                  style={{ borderLeft: `3px solid ${item.color}` }}
                >
                  <Icon size={15} style={{ color: item.color }} />
                  <span>{item.label}</span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export const PALETTE_DRAG_MIME = DRAG_MIME;
