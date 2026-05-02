'use client';

import { ReactFlowProvider } from '@xyflow/react';
import { useState, type ReactNode } from 'react';
import { PanelLeftClose, PanelLeft } from 'lucide-react';

interface BuilderLayoutProps {
  /** Sidebar content — palette + workflow controls. */
  sidebar: ReactNode;
  /** Right editor panel (rendered conditionally inside the layout). */
  editor?: ReactNode;
  /** Toolbar (Run/Stop/stats) above the canvas column. */
  toolbar: ReactNode;
  /** The React Flow canvas. */
  canvas: ReactNode;
  /** Optional overlays: album, lightbox, etc. */
  overlays?: ReactNode;
}

// 3-column flex layout (sidebar / canvas / editor). Sidebar collapses < 768px
// behind a toggle button; editor sidebar is rendered by the parent only when
// a node is selected.
export function BuilderLayout({ sidebar, editor, toolbar, canvas, overlays }: BuilderLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <ReactFlowProvider>
      <div
        className="builder-layout flex gap-0 overflow-hidden bg-bg-primary relative"
        style={{ height: 'calc(100vh - 48px)' }}
      >
        {/* Mobile/desktop sidebar toggle */}
        <button
          type="button"
          onClick={() => setSidebarOpen((v) => !v)}
          className="absolute top-2 left-2 z-30 md:hidden flex items-center justify-center w-8 h-8 rounded-md bg-bg-card border border-border text-text-secondary hover:text-text-primary"
          title={sidebarOpen ? 'Ẩn sidebar' : 'Hiện sidebar'}
        >
          {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeft size={16} />}
        </button>

        {sidebarOpen && (
          <aside className="w-60 min-w-[240px] max-w-[240px] bg-bg-secondary border-r border-border overflow-y-auto flex flex-col">
            {sidebar}
          </aside>
        )}

        <div className="flex-1 flex flex-col overflow-hidden min-w-0 min-h-0">
          {toolbar}
          <div className="flex-1 relative min-h-0">{canvas}</div>
        </div>

        {editor && (
          <aside className="w-60 min-w-[240px] max-w-[240px] bg-bg-secondary border-l border-border overflow-y-auto">
            {editor}
          </aside>
        )}

        {overlays}
      </div>
    </ReactFlowProvider>
  );
}
