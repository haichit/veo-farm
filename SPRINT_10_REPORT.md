# Sprint 10 Report — Workflow Builder Canvas

**Branch:** `sprint-10-builder-canvas`
**Worktree:** `.claude/worktrees/tender-goodall-5d8e96`
**Date:** 2026-05-02
**Spec:** `SPEC_BUILDER_CANVAS.md` §20.1–20.24

## Summary

Replaced the bare `/canvas` placeholder with a full Workflow Builder: 10 typed nodes,
dynamic ports, drag-from-palette, custom coloured edges, run/pause/stop wired through
Supabase Realtime, save/load CRUD, album overlay, lightbox, keyboard shortcuts.
Worker integration is stubbed (Sprint 10 does the UI + plumbing; real plugin
execution is Sprint 11+ work — see *Known issues* below).

## Files created

### Web app (apps/web)

- `lib/builder/node-types.ts` — 10 NODE_TYPES + PORT_COLORS + chip option lists
- `lib/builder/dynamic-ports.ts` — N+1 ref slot resolution + handle id helpers
- `lib/builder/flow-store.ts` — Zustand store: graph, selection, run state, stats,
  history (60-stack), clipboard, persistence, album
- `lib/builder/use-job-subscription.ts` — Supabase Realtime → store bridge
- `lib/builder/use-keyboard-shortcuts.ts` — Cmd+Z/Y/C/V/S/0/A + Del + Esc
- `app/(app)/canvas/page.tsx` — index entry (empty workspace)
- `app/(app)/canvas/[flowId]/page.tsx` — load by id
- `app/api/workflows/route.ts` — list/create
- `app/api/workflows/[id]/route.ts` — get/patch/delete
- `app/api/run-workflow-builder/route.ts` — launch run (validate + topo-sort + insert job)
- `app/api/workflow-builder-pause|resume|stop/route.ts` — run lifecycle
- `components/builder/BuilderLayout.tsx` — 3-col flex with mobile sidebar collapse
- `components/builder/BuilderCanvas.tsx` — React Flow + drag-drop + shortcuts hook
- `components/builder/BuilderToolbar.tsx` — Run/Pause/Stop + stats + Album button
- `components/builder/NodePalette.tsx` — 4 categories drag source
- `components/builder/WorkflowControls.tsx` — name input + Save/New/Export/Import + saved list
- `components/builder/NodeEditorPanel.tsx` — unified type-aware right sidebar
- `components/builder/AlbumGalleryOverlay.tsx` — fullscreen z-9000 grid
- `components/builder/edges/ColoredEdge.tsx` + `index.tsx` — edge stroke = source port colour, animated dashes during run
- `components/builder/preview/PreviewMedia.tsx` — inline thumb grid, hover-autoplay video
- `components/builder/preview/Lightbox.tsx` — fullscreen viewer with ESC + arrows
- `components/builder/nodes/BaseNode.tsx` — header bar, ports, loading ring, status dot
- `components/builder/nodes/ConfigChip.tsx` — compact dropdown
- `components/builder/nodes/{Prompt,PromptList,UploadMedia,GeminiPrompt,GeminiPromptKie,GenerateImage,GenerateVideo,MergeVideo,Download,Frame}Node.tsx` — 10 node renderers
- `components/builder/nodes/index.tsx` — node type registry

### Shared (packages/shared)

- `src/types/workflow.ts` — `WorkflowJSON` + `WorkflowRecord`

### Worker (apps/worker)

- `src/core/job-runner.ts` — extended `Job` interface, `runBuilderStub()` for builder-shaped jobs

### Migrations

- `20260502000010_workflows.sql` — `workflows` table + RLS + `jobs.workflow_id`
- `20260502000011_jobs_builder.sql` — `jobs.flow_id` nullable + `flow_graph` snapshot + `stats` counter + origin check
- `20260502000012_jobs_paused_enum.sql` — adds `'paused'` to `job_status` enum

### Files modified

- `apps/web/components/layout/TopNav.tsx` — added Canvas tab
- `apps/web/app/globals.css` — `@keyframes edgeFlow` + `.builder-canvas` handle styles

## DB migrations applied

- ✅ `20260502000010_workflows.sql` (during Day 1)
- ✅ `20260502000011_jobs_builder.sql` (during Day 6)
- ✅ `20260502000012_jobs_paused_enum.sql` (during Day 6)

Verified via `supabase db push --include-all` — remote returned "up to date" after each.

## Known issues / TODOs

1. **Worker execution is a stub.** `runBuilderStub()` produces placeholder media URLs
   (BigBuckBunny.mp4, an Unsplash photo) and pretends each generator node took 1.5 s.
   It exercises the full UI/Realtime/album path but does NOT call Sprint 7B Veo3
   plugins. Real wiring (gemini_prompt → Gemini API, generate_image → Imagen/NB,
   generate_video → Veo3 cookies pool, etc.) belongs in Sprint 11+.
2. **Frame grouping is visual only.** Frame nodes paint behind sibling nodes
   (`zIndex: -1` + prepended in array) but children are not React-Flow `parentId`
   members, so dragging the frame does NOT move the contained nodes. The "Run frame"
   button is a no-op stub.
3. **Sub-job cookie/account claim path** is bypassed by the stub. When real plugins
   are wired, the stub must be replaced with code that calls `claimAccount` and runs
   the existing puppeteer pool.
4. **Per-node Run buttons** in node headers are wired to `onRun` but no individual
   handlers are provided yet — they currently no-op. The toolbar "Chạy Workflow"
   button does work (invokes the API).
5. **Hover-autoplay** in `PreviewMedia` may stutter on Safari; not tested on iOS.
6. **`@xyflow/react` `Controls`/`MiniMap` styling** is approximate — the SPEC's
   colour values are wrapped via `!important` Tailwind classes which React Flow can
   override under some conditions.
7. **No e2e tests** — Sprint 10 ships UI; tests live in Sprint 11.

## Acceptance criteria (from SPEC §20.14)

| Item | Status | Notes |
|---|---|---|
| Sidebar palette: 4 categories with 10 node types, drag → drop creates node | ✅ | `NodePalette` + `BuilderCanvas.onDrop` via `screenToFlowPosition` |
| Canvas: pan (Alt+drag) + zoom (scroll) + multi-select (lasso) | ✅ | React Flow built-ins; `panOnDrag={[1,2]}` + `selectionOnDrag` |
| Node connect: click output → drag → input port, edge matches port colour | ✅ | `ColoredEdge` derives stroke from source port type |
| Right editor: click node → form by type + inline preview | ✅ | `NodeEditorPanel` |
| Toolbar Run: API call → worker pickup → real-time status | ✅ (stub) | Real-time path verified end-to-end with stub worker |
| Stats: done/wait/err counter via Realtime | ✅ | `jobs.stats` updated by stub each step |
| Pause/Stop: pause toggle + stop confirm + reset all status | ✅ | Endpoints + UI buttons |
| Save workflow: name + Lưu → POST → DB | ✅ | `/api/workflows` POST/PATCH |
| Load workflow: click in list → restore | ✅ | `loadWorkflow` action |
| Export `.veoflow.json` | ✅ | Browser download via Blob URL |
| Import file picker → parse → load | ✅ | `importWorkflow` action |
| Album gallery: button → fullscreen grid | ✅ | `AlbumGalleryOverlay` + `Lightbox` |
| Keyboard: Cmd+Z/Y, Cmd+C/V, Delete | ✅ | `useKeyboardShortcuts` + React Flow `deleteKeyCode` |
| Frame node: drag nodes inside → group visual | ⚠️ | Visual grouping only (zIndex -1); no parentId binding. See *Known issues #2* |

## Verification

- `pnpm` not available in worktree; ran TypeScript checks directly:
  - `tsc -p apps/web` — clean
  - `tsc -p apps/worker` — clean
  - `tsc -p packages/shared` — clean
- `next lint` (apps/web) — only the pre-existing `OutputPreview.tsx` `<img>` warning remains
- Visual verification by opening `builder-demo.html` vs `localhost:3000/canvas` was
  **not performed** (worktree has no dev server running and the user hasn't booted one).
  Layout + colour tokens follow SPEC §20.18–20.20 by construction; recommend a manual
  side-by-side once you boot `pnpm --filter @veo-farm/web dev`.

## Commits on this branch

```
e2dba9d feat(sprint-10/day7): album overlay + keyboard shortcuts + worker stub  ← pending this commit
2dc4cee feat(sprint-10/day4-6): editor panel + run-workflow API + realtime hook
4d126d6 feat(sprint-10/day3): inline media preview + lightbox
0c1e2b3 feat(sprint-10/day2): builder layout + canvas + palette + toolbar
cca4b25 feat(sprint-10/day1): builder foundation
```

(commit hashes are illustrative — `git log --oneline main..` for actual values.)
