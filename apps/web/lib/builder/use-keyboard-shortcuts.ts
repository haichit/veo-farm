'use client';

import { useEffect, useRef } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useFlowStore } from './flow-store';

// Canvas-level keyboard shortcuts. Skipped while focus is in a text input
// so typing in textareas/inputs doesn't trigger global commands.
export function useKeyboardShortcuts() {
  const undo = useFlowStore((s) => s.undo);
  const redo = useFlowStore((s) => s.redo);
  const copySelected = useFlowStore((s) => s.copySelected);
  const paste = useFlowStore((s) => s.paste);
  const removeNodes = useFlowStore((s) => s.removeNodes);
  const selectMany = useFlowStore((s) => s.selectMany);
  const selectNode = useFlowStore((s) => s.selectNode);
  const saveWorkflow = useFlowStore((s) => s.saveWorkflow);
  const closeAlbum = useFlowStore((s) => s.closeAlbum);
  const albumOpen = useFlowStore((s) => s.albumOpen);
  const { fitView, screenToFlowPosition } = useReactFlow();

  // Track the mouse in screen coords so Cmd/Ctrl+V can paste under the
  // cursor instead of always landing near the copied nodes' original spot.
  const lastMouse = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    function onMove(e: MouseEvent) {
      lastMouse.current = { x: e.clientX, y: e.clientY };
    }
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inEditable =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.tagName === 'SELECT');

      const mod = e.metaKey || e.ctrlKey;

      // Esc — close album/editor first.
      if (e.key === 'Escape' && !inEditable) {
        if (albumOpen) {
          closeAlbum();
          return;
        }
        selectNode(null);
        return;
      }

      if (inEditable) return;

      // Cmd/Ctrl + Z — undo (Shift = redo).
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      // Cmd/Ctrl + Y — redo alt.
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      // Cmd/Ctrl + C — copy selection.
      if (mod && e.key.toLowerCase() === 'c') {
        copySelected();
        return;
      }
      // Cmd/Ctrl + V — paste under the cursor's last known position.
      if (mod && e.key.toLowerCase() === 'v') {
        const cursor = lastMouse.current
          ? screenToFlowPosition(lastMouse.current)
          : undefined;
        paste(cursor);
        return;
      }
      // Cmd/Ctrl + S — save.
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveWorkflow();
        return;
      }
      // Cmd/Ctrl + 0 — fit view.
      if (mod && e.key === '0') {
        e.preventDefault();
        fitView({ duration: 300, padding: 0.2 });
        return;
      }
      // Cmd/Ctrl + A — select all.
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        const ids = useFlowStore.getState().nodes.map((n) => n.id);
        selectMany(ids);
        return;
      }
      // Delete / Backspace — remove selected nodes.
      if ((e.key === 'Delete' || e.key === 'Backspace') && !mod) {
        const sel = useFlowStore.getState().selectedNodeIds;
        if (sel.length > 0) {
          e.preventDefault();
          removeNodes(sel);
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    undo,
    redo,
    copySelected,
    paste,
    screenToFlowPosition,
    removeNodes,
    selectMany,
    selectNode,
    saveWorkflow,
    fitView,
    albumOpen,
    closeAlbum,
  ]);
}
