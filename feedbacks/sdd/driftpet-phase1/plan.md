# driftpet Phase 1 Plan

## Spec Reference

- Spec: `feedbacks/sdd/driftpet-phase1/spec.md`
- Workflow rule: `docs/sdd-workflow.md`

This plan only covers the first implementation plan derived from the approved Phase 1 spec.
It does not widen scope beyond the two committed promises:

1. desktop-pet presence
2. Telegram link handoff into local Obsidian ingest

## Current Codebase Anchors

### Desktop shell and window

- `src/main/app/windows.ts`
  - creates the frameless always-on-top transparent window
  - persists bounds
- `electron/ipc.ts`
  - currently exposes window-size changes only
- `src/renderer/components/PetShell.tsx`
  - already contains pet expression, blink, poke, and presence UI
- `src/renderer/styles.css`
  - already contains the current pet shell visuals

### Telegram ingest path

- `src/main/telegram/parse-message.ts`
  - classifies Telegram messages into `tg_text` vs `tg_url`
- `src/main/telegram/poller.ts`
  - current runtime path is `parse -> enrich -> ingestInput`
- `src/main/telegram/enrich-input.ts`
  - currently assumes Telegram URLs should be fetched and extracted locally as article-like content
- `src/main/ingest/ingest.ts`
  - owns item persistence, card creation, and event writes

### Existing constraints exposed by the current code

- Current window dragging is based on native draggable regions in the renderer shell.
- Current Telegram URL handling is optimized for local extraction into driftpet cards, not for note-runner orchestration into the vault.
- Current pet aliveness is mostly expression and copy state; there is no direction-aware drag animation state yet.

## Proposed Approach

## A. Desktop-pet presence

### A1. Keep the current Electron shell, but narrow it toward a true pet surface

Do not introduce a new windowing system.
Reuse the current frameless transparent `BrowserWindow`.

Phase 1 should treat the current `PetShell` as the starting point and simplify it toward:

- stronger visible pet identity
- clearer basic motion / expression loop
- direct cursor reaction
- drag behavior that feels embodied

### A2. Replace passive native drag-only behavior with controlled drag state

The spec requires the pet to feel like it runs toward the drag direction.
That is hard to do with pure `-webkit-app-region: drag` because the renderer does not get rich enough motion state to animate direction reliably.

Planned shift:

- add explicit renderer drag state
- add IPC for moving the main window during drag
- infer drag direction from pointer deltas
- map that direction into pet animation state

Target result:

- dragging still moves the window
- renderer can visually reflect left/right movement while drag is active

### A3. Keep animation scope minimal

Phase 1 should not attempt a full production animation system.

Minimum acceptable animation layer:

- blink / idle loop
- hover-or-cursor-contact reaction
- drag-direction run state

If a more elaborate Codex-pet-style sprite or atlas system is desired later, Phase 1 should leave room for it, but not depend on it.

## B. Telegram link handoff into local vault ingest

### B1. Change the meaning of `tg_url`

Today `tg_url` flows through local article extraction and then into the existing driftpet digest path.

Phase 1 should instead treat `tg_url` as an external note-runner trigger:

1. classify the URL type
2. run the appropriate note-creation skill path
3. obtain the generated markdown artifact
4. ingest that markdown artifact
5. report completion status and artifact path back to the user

### B2. Use explicit routing rules provided by the user

Routing rule:

- if the link is a video, use `video-to-note`
- if the link is an article, use `article-to-note`
- after the markdown note is created, ingest that markdown
- after completion, report status and artifact to the user

This should be encoded as a dedicated ingest-runner boundary rather than hidden inside generic extraction code.

### B3. Introduce a note-runner boundary instead of hardwiring skills into Telegram parsing

Recommended shape:

- keep `parse-message.ts` focused on message parsing only
- keep `poller.ts` focused on update processing only
- add a dedicated runner/orchestrator module for URL note handoff

Likely module shape:

- `src/main/telegram/url-note-runner.ts`
- `src/main/telegram/url-classifier.ts`
- or similar names chosen during implementation

That runner should own:

- URL type classification
- command or external-runner invocation policy
- vault path selection
- artifact path capture
- success/failure reporting

### B4. Treat Claude + skill execution as an external dependency boundary

The current repo does not yet contain a built-in ingest runner for:

- launching Claude in `/Users/mac/my-obsidian-vault`
- applying `video-to-note` or `article-to-note`
- then ingesting the produced markdown

Therefore the first implementation should isolate this behind a runner contract.

The plan should support:

- fixed vault path for Phase 1: `/Users/mac/my-obsidian-vault`
- explicit classification to `video` or `article`
- a replaceable command-execution layer
- captured stdout/stderr or status summary
- durable artifact reporting

## Files And Modules Likely Touched

### Product shell / motion

- `src/renderer/components/PetShell.tsx`
- `src/renderer/App.tsx`
- `src/renderer/styles.css`
- `electron/preload.ts`
- `electron/ipc.ts`
- `src/main/app/windows.ts`
- `src/main/app/window-state.ts`

### Telegram link routing and ingest

- `src/main/telegram/poller.ts`
- `src/main/telegram/enrich-input.ts`
- `src/main/telegram/parse-message.ts`
- `src/main/ingest/ingest.ts`
- new runner / classifier modules under `src/main/telegram/` or `src/main/ingest/`

### Verification

- `scripts/parse-telegram-message.test.mjs`
- new tests for URL routing / runner behavior
- possibly UI smoke coverage if pet interaction states change visibly

## Risks

### Risk 1. Native drag versus animated drag conflict

If the implementation keeps relying only on native drag regions, direction-aware run feedback may stay fake or inconsistent.

Mitigation:

- validate early whether explicit drag IPC is required
- bias toward controlled drag if native drag blocks the spec

### Risk 2. Skill invocation is not a normal in-process runtime dependency

`video-to-note` and `article-to-note` are workflow skills, not ordinary application libraries.

Mitigation:

- isolate execution behind a runner boundary
- keep the first version explicit and inspectable
- report artifact paths and task outcome every time

### Risk 3. Article/video classification can be ambiguous

Some URLs will not cleanly reveal whether they are articles or videos.

Mitigation:

- define a deterministic classifier order
- capture ambiguous cases as failure states with a clear report
- do not silently guess beyond the defined rules

### Risk 4. Current app identity can drift again during implementation

The existing app still contains manual chaos-reset and reminder-like surfaces.

Mitigation:

- keep the spec as the primary boundary
- reject implementation ideas that widen scope into generic anti-drift or chat-assistant behavior

## Rejected Options

- Keep `tg_url` on the current local article extraction path
  - rejected because the approved Phase 1 promise is vault-note handoff, not just card generation
- Implement click-to-chat in the same phase
  - rejected because the spec explicitly deferred it
- Build a full animation framework before proving the core pet presence loop
  - rejected because it widens scope before verifying the minimal experience

## Verification Plan

Phase 1 verification should prove both promises separately.

### Desktop-pet presence verification

- renderer interaction test or smoke check for startup surface
- visible blink / expression state present after launch
- pointer contact triggers reaction state
- drag updates window location
- drag direction maps to visual state

### Telegram link handoff verification

- Telegram URL parse still identifies `tg_url` correctly
- URL classifier routes `video` and `article` deterministically
- note runner launches the correct skill path
- generated markdown artifact path is captured
- ingest step runs after markdown creation
- completion report includes status and produced artifact

### Baseline repo verification

- `npm run typecheck`
- `npm run check:repo`
- relevant Telegram/unit tests
- any new targeted tests introduced by the runner or drag changes
