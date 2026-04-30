'use client';
import { createContext, useContext, useEffect, useState } from 'react';

interface NodeOutput {
  nodeType: string;
  status: string;
  items: { status: string; output: any; error: string | null; sceneIdx?: number }[];
}

interface FlowOutputs {
  job: { id: string; status: string; output_url: string | null } | null;
  outputs: Record<string, NodeOutput>;
}

const Ctx = createContext<FlowOutputs>({ job: null, outputs: {} });

export function FlowOutputsProvider({ flowId, children }: { flowId: string; children: React.ReactNode }) {
  const [data, setData] = useState<FlowOutputs>({ job: null, outputs: {} });

  useEffect(() => {
    let active = true;
    async function load() {
      const r = await fetch(`/api/flows/${flowId}/outputs`);
      if (!r.ok) return;
      const d = await r.json();
      if (active) setData(d);
    }
    load();
    const t = setInterval(load, 3000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [flowId]);

  return <Ctx.Provider value={data}>{children}</Ctx.Provider>;
}

export function useNodeOutput(nodeId: string) {
  const ctx = useContext(Ctx);
  return ctx.outputs[nodeId];
}

export function useJobStatus() {
  const ctx = useContext(Ctx);
  return ctx.job;
}
