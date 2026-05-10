# driftpet Phase 1 Tasks

Spec reference:
- `feedbacks/sdd/driftpet-phase1/spec.md`

Plan reference:
- `feedbacks/sdd/driftpet-phase1/plan.md`

Status legend:
- `待执行`
- `执行中`
- `待验收`
- `已通过`
- `未通过`
- `阻塞`
- `作废`

## Task List

### T1. Freeze the implementation boundary

- Status: `已通过`
- Scope:
  - confirm Phase 1 only covers desktop-pet presence and Telegram link handoff
  - confirm click-to-chat and simple memory remain deferred
- Expected output:
  - plan and tasks remain aligned with the approved spec
- Verification:
  - manual review against `spec.md`
  - repository workflow baseline updated to `workflow-portable`

### T2. Add controlled pet drag and direction state

- Status: `已通过`
- Scope:
  - design or implement explicit drag-state handling for the pet window
  - expose any needed IPC to move the window during drag
  - surface left/right motion state to the renderer
- Expected output:
  - the pet can be dragged freely
  - drag direction can drive visible movement state
- Verification:
  - `npm run test:ui-smoke`
  - `npm run typecheck`

### T3. Tighten basic pet aliveness

- Status: `已通过`
- Scope:
  - keep or refine blink / idle loop
  - make cursor contact trigger a visible reaction
  - make sure the mini/compact surface still feels like one coherent pet
- Expected output:
  - the startup pet presence satisfies the minimal acceptance experience
- Verification:
  - `npm run test:ui-smoke`
  - manual visual verification still recommended before phase close

### T4. Replace `tg_url` local extraction with note-runner routing

- Status: `已通过`
- Scope:
  - stop treating every Telegram URL as local article text extraction
  - add URL classification into `video` or `article`
  - route to the correct external skill flow
- Expected output:
  - `tg_url` becomes a note-handoff path instead of a generic digest path
- Verification:
  - `npm run test:telegram-parse`
  - `npm run test:url-note-runner`

### T5. Build the vault note runner boundary

- Status: `待验收`
- Scope:
  - run `video-to-note` for video URLs
  - run `article-to-note` for article URLs
  - operate against `/Users/mac/my-obsidian-vault`
  - ingest the produced markdown artifact afterward
  - capture completion status and artifact information
- Expected output:
  - deterministic runner behavior with explicit success/failure reporting
- Verification:
  - `npm run test:telegram-note-workflow`
  - `node --test scripts/telegram-note-poller-integration.test.mjs`
  - `node --test src/main/telegram/poller-report.test.mjs`
  - real vault write with one video URL and one article URL still pending manual acceptance

### T6. Final reporting and verification

- Status: `执行中`
- Scope:
  - ensure the system reports task completion and produced artifacts back to the user
  - run repo verification
- Expected output:
  - final delivery includes status + artifact reporting
- Verification:
  - `npm run typecheck`
  - `npm run check:repo`
  - `npm run test:ui-smoke`
  - `npm run test:telegram-parse`
  - `npm run test:telegram-note-workflow`
  - `npm run test:url-note-runner`
  - `node --test scripts/telegram-note-poller-integration.test.mjs`
  - `node --test src/main/telegram/poller-report.test.mjs`

## Execution Order

1. `T1` freeze boundary
2. `T2` controlled drag path
3. `T3` basic pet aliveness polish
4. `T4` Telegram URL rerouting
5. `T5` vault note runner
6. `T6` final verification and reporting

## Blockers / Smallest Next Move

Current blocker status:
- 无自动化阻塞；当前剩余的是 Phase 1 手动验收口

Most likely blocker:
- real-world Claude / skill execution against `/Users/mac/my-obsidian-vault` may still differ from the mocked test contract

If blocked there, the smallest next move is:
- send one real article URL and one real video URL through Telegram, then record produced artifact paths and any runner mismatch
