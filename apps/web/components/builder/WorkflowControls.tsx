'use client';

import { Save, Plus, Download, Upload, Trash2 } from 'lucide-react';
import { useEffect } from 'react';
import { useFlowStore } from '@/lib/builder/flow-store';

export function WorkflowControls() {
  const currentWorkflowName = useFlowStore((s) => s.currentWorkflowName);
  const setCurrentWorkflow = useFlowStore((s) => s.setCurrentWorkflow);
  const currentWorkflowId = useFlowStore((s) => s.currentWorkflowId);
  const saveWorkflow = useFlowStore((s) => s.saveWorkflow);
  const newWorkflow = useFlowStore((s) => s.newWorkflow);
  const exportWorkflow = useFlowStore((s) => s.exportWorkflow);
  const importWorkflow = useFlowStore((s) => s.importWorkflow);
  const savedWorkflows = useFlowStore((s) => s.savedWorkflows);
  const refreshSavedWorkflows = useFlowStore((s) => s.refreshSavedWorkflows);
  const loadWorkflow = useFlowStore((s) => s.loadWorkflow);
  const deleteWorkflow = useFlowStore((s) => s.deleteWorkflow);

  useEffect(() => {
    refreshSavedWorkflows();
  }, [refreshSavedWorkflows]);

  return (
    <div className="p-3 border-b border-border">
      <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-2.5">
        Workflows
      </div>

      <div className="space-y-2">
        <input
          type="text"
          value={currentWorkflowName}
          onChange={(e) => setCurrentWorkflow(currentWorkflowId, e.target.value)}
          placeholder="Tên workflow..."
          className="w-full bg-bg-input border border-border rounded-md px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-accent transition-colors"
        />
        <div className="flex gap-1.5">
          <button
            onClick={() => saveWorkflow()}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-md text-[11px] font-medium bg-gradient-to-br from-accent to-accent-hover text-white shadow-accent-glow hover:shadow-accent-glow-lg transition-all"
          >
            <Save size={14} /> Lưu
          </button>
          <button
            onClick={newWorkflow}
            title="New workflow"
            className="px-2.5 py-1.5 rounded-md text-[11px] bg-white/[0.03] border border-border text-text-secondary hover:bg-white/[0.06] hover:text-text-primary transition-colors"
          >
            <Plus size={14} />
          </button>
          <button
            onClick={exportWorkflow}
            title="Export"
            className="px-2.5 py-1.5 rounded-md text-[11px] bg-white/[0.03] border border-border text-text-secondary hover:bg-white/[0.06] hover:text-text-primary transition-colors"
          >
            <Download size={14} />
          </button>
          <button
            onClick={importWorkflow}
            title="Import"
            className="px-2.5 py-1.5 rounded-md text-[11px] bg-white/[0.03] border border-border text-text-secondary hover:bg-white/[0.06] hover:text-text-primary transition-colors"
          >
            <Upload size={14} />
          </button>
        </div>
      </div>

      <div className="mt-3 space-y-1 max-h-60 overflow-y-auto">
        {savedWorkflows.length === 0 && (
          <p className="text-[10px] text-text-muted px-2 py-1">Chưa có workflow nào.</p>
        )}
        {savedWorkflows.map((wf) => (
          <div
            key={wf.id}
            onClick={() => loadWorkflow(wf.id)}
            className={`group flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer hover:bg-bg-card-hover text-xs transition-colors ${
              currentWorkflowId === wf.id ? 'bg-accent-glow text-text-primary' : ''
            }`}
          >
            <span className="flex-1 truncate text-text-primary">{wf.name}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Xoá workflow "${wf.name}"?`)) deleteWorkflow(wf.id);
              }}
              className="opacity-0 group-hover:opacity-100 text-error hover:bg-error/10 p-1 rounded transition-all"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
