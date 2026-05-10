# Thread Mode Plan

## Spec Reference

- Spec: `feedbacks/sdd/thread-mode/spec.md`
- Workflow rule: `docs/sdd-workflow.md`

## Current Codebase Anchors

- `src/main/status/app-status.ts`
  - already exposes `rememberedThread`
- `src/main/db/cards.ts`
  - already returns recent cards with `related` and `knowledgeTag`
- `src/main/claude/dispatch.ts`
  - already builds a structured prompt with remembered-thread and sibling-card context
- `electron/ipc.ts`
  - currently supports single-card Claude dispatch only
- `src/renderer/App.tsx`
  - already derives `rememberedThreadCard`
- `src/renderer/components/PetWorkbench.tsx`
  - already shows resume strip and recent-card fold

## Proposed Approach

### A. Add a shared thread-bundle derivation layer

Introduce one pure helper that derives a thread bundle from:

- remembered-thread anchor card
- recent card list
- related-card links
- backlink links
- same-tag matches when the tag is not generic

This helper should be reusable from both renderer and main-process code.

### B. Keep dispatch backward-compatible, then add thread dispatch

Do not replace the current single-card dispatch path.

Instead:

- keep `card:dispatch-claude-code`
- add `card:dispatch-claude-thread`
- extend the prompt payload with `mode` and optional `threadBundle`

That keeps existing history-drawer behavior intact while adding a new explicit path for the workbench.

### C. Surface thread mode only when continuity evidence exists

In the renderer:

- derive `activeThreadBundle` from `rememberedThreadCard + history`
- show a compact thread panel in the expanded workbench
- hide it entirely when no remembered thread exists

### D. Keep first-version scope narrow

No new drawer, no thread tabs, no schema changes.
Only workbench visibility + thread-aware dispatch.

## Files And Modules Touched

- `src/main/claude/dispatch.ts`
- `src/main/types/claude.ts`
- `src/main/types/ipc.ts`
- `src/main/types/thread.ts`
- `src/shared/thread-bundle.ts`
- `electron/ipc.ts`
- `electron/preload.ts`
- `src/renderer/App.tsx`
- `src/renderer/components/PetShell.tsx`
- `src/renderer/components/PetWorkbench.tsx`
- `src/renderer/styles.css`
- `src/renderer/vite-env.d.ts`
- `scripts/claude-dispatch.test.mjs`
- `scripts/app-ui-smoke.test.mjs`
- `src/shared/thread-bundle.test.mjs`

## Risks And Rejected Options

### Risk 1. Generic knowledge tags create false threads

Mitigation:

- only use same-tag matching for non-generic tags
- still allow explicit `related` / backlink joins

### Risk 2. Renderer and main derive different thread membership

Mitigation:

- use one shared helper instead of duplicating logic

### Rejected: add a thread table first

Rejected because this widens scope before the product proves that users benefit from a visible/promptable thread bundle at all.

### Rejected: replace single-card dispatch entirely

Rejected because history-drawer dispatch still needs a narrow single-card action.

## Verification Plan

- `npm run typecheck`
- `node --test --experimental-strip-types src/shared/thread-bundle.test.mjs`
- `npm run test:claude-dispatch`
- `npm run test:ui-smoke`

Manual follow-up:

- open the workbench in continuous mode and confirm the thread panel appears
- click `派给 Claude Code（整条线）`
- confirm the generated prompt contains `Dispatch mode` and `Active thread bundle`
