'use client';

import * as Icons from 'lucide-react';
import { useReactFlow } from '@xyflow/react';
import { useFlowStore } from '@/lib/builder/flow-store';
import {
  CATEGORY_ORDER,
  NODE_CATEGORIES,
  nodesByCategory,
  type BuilderNodeType,
} from '@/lib/builder/node-types';

// Custom MIME (kept for completeness) PLUS a module-level fallback ref —
// some browsers/extensions strip non-standard MIME data, and reading the
// type from a plain JS variable is bulletproof.
const DRAG_MIME = 'application/veofarm-node-type';

let draggedType: BuilderNodeType | null = null;
export function getDraggedType(): BuilderNodeType | null {
  return draggedType;
}

export function NodePalette() {
  const addNode = useFlowStore((s) => s.addNode);
  const reactFlow = useReactFlow();

  // Click fallback — drops a node near the centre of the current viewport
  // for cases where HTML5 drag-and-drop is blocked (extensions, OS-level
  // accessibility settings, headless test runs).
  function onPaletteClick(type: BuilderNodeType) {
    const vp = reactFlow.getViewport();
    const rect = document
      .querySelector('.builder-canvas-wrapper')
      ?.getBoundingClientRect();
    const centerX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const centerY = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
    const position = reactFlow.screenToFlowPosition({ x: centerX, y: centerY });
    // Tiny scatter so back-to-back clicks don't pile on the same spot.
    position.x += (Math.random() - 0.5) * 60;
    position.y += (Math.random() - 0.5) * 60;
    addNode(type, position);
    // Avoid TS unused-warning for vp (kept around in case we want to log it).
    void vp;
  }

  function onDragStart(e: React.DragEvent, type: BuilderNodeType) {
    draggedType = type;
    try {
      e.dataTransfer.setData(DRAG_MIME, type);
      e.dataTransfer.setData('text/plain', type);
      e.dataTransfer.effectAllowed = 'copy';
    } catch {
      /* Some browsers throw on custom MIME — module ref still works. */
    }
  }
  function onDragEnd() {
    draggedType = null;
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
                  onDragEnd={onDragEnd}
                  onClick={() => onPaletteClick(item.type)}
                  title="Click hoặc kéo vào canvas để thêm"
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
