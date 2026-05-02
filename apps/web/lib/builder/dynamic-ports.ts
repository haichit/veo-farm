// Dynamic input port resolution for generator nodes (SPEC §20.2).
// gemini_prompt(_kie), generate_image, generate_video grow their ref-image
// slots based on how many connections currently target the node — N+1 slots
// shown so user can always wire one more, capped at MAX_IMG_REFS.

import type { Edge } from '@xyflow/react';
import {
  MAX_IMG_REFS,
  NODE_TYPES,
  PORT_COLORS,
  type BuilderNodeType,
  type PortDef,
} from './node-types';

const DYNAMIC_PORT_NODES = new Set<BuilderNodeType>([
  'gemini_prompt',
  'gemini_prompt_kie',
  'generate_image',
  'generate_video',
]);

interface NodeForPorts {
  id: string;
  type: string;
  data?: { config?: Record<string, unknown> };
}

/**
 * Compute the visible input ports for a node, accounting for dynamic ref slots.
 *
 * - Port 0 is always the primary text/prompt input (string, optional).
 * - Ports 1..N are media reference slots whose visible count = min(connections+1, max).
 *   For `generate_video` in FRAME mode, max is 2 (Start Frame, End Frame).
 *   In REF mode, max is MAX_IMG_REFS (5 slots labeled "ref img N").
 *   Other nodes always cap at MAX_IMG_REFS with "ref img N" labels.
 *
 * Each port's handle id is "input-<index>" — store edges with `targetHandle`
 * matching this format so the resolver can count refs correctly.
 */
export function getNodeInputPorts(node: NodeForPorts, edges: Edge[]): PortDef[] {
  if (!isDynamicPortNode(node.type)) {
    const def = NODE_TYPES[node.type as BuilderNodeType];
    return def?.inputs ?? [];
  }

  const refConnections = edges.filter((e) => {
    if (e.target !== node.id || !e.targetHandle) return false;
    const idx = parseInt(e.targetHandle.replace('input-', ''), 10);
    return Number.isFinite(idx) && idx > 0;
  }).length;

  const isVideoNode = node.type === 'generate_video';
  const isFrameMode = node.data?.config?.videoMode === 'FRAME';
  const maxRefs = isVideoNode && isFrameMode ? 2 : MAX_IMG_REFS;
  const showSlots = Math.min(refConnections + 1, maxRefs);

  // Port 0: primary text input.
  const textPortName =
    node.type === 'gemini_prompt' || node.type === 'gemini_prompt_kie' || node.type === 'gemini_vision'
      ? 'text'
      : 'prompt';

  const ports: PortDef[] = [
    { name: textPortName, type: 'string', color: PORT_COLORS.string, optional: true },
  ];

  // Ports 1..showSlots: media reference slots.
  const isVisionNode = node.type === 'gemini_vision';
  for (let i = 0; i < showSlots; i++) {
    let portName: string;
    if (isVideoNode && isFrameMode) {
      portName = i === 0 ? 'Start Frame' : 'End Frame';
    } else if (isVisionNode) {
      portName = `media ${i + 1}`;
    } else {
      portName = `ref img ${i + 1}`;
    }
    // Gemini Vision accepts both image and video — use 'any' colour so
    // edges from upload_media (video) or generate_image (image) both fit.
    const portType = isVisionNode ? 'any' : 'image';
    ports.push({
      name: portName,
      type: portType,
      color: isVisionNode ? PORT_COLORS.any : PORT_COLORS.image,
    });
  }

  return ports;
}

/** Returns the handle id used by React Flow for input port at index i. */
export function inputHandleId(index: number): string {
  return `input-${index}`;
}

/** Returns the handle id used by React Flow for output port at index i. */
export function outputHandleId(index: number): string {
  return `output-${index}`;
}

export function isDynamicPortNode(type: string): boolean {
  return DYNAMIC_PORT_NODES.has(type as BuilderNodeType);
}

/** Extract the numeric index from a handle id like "input-2" → 2. */
export function parseHandleIndex(handle: string | null | undefined): number | null {
  if (!handle) return null;
  const m = /-(\d+)$/.exec(handle);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}
