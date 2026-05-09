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

- Status: `待执行`
- Scope:
  - confirm Phase 1 only covers desktop-pet presence and Telegram link handoff
  - confirm click-to-chat and simple memory remain deferred
- Expected output:
  - plan and tasks remain aligned with the approved spec
- Verification:
  - manual review against `spec.md`

### T2. Add controlled pet drag and direction state

- Status: `待执行`
- Scope:
  - design or implement explicit drag-state handling for the pet window
  - expose any needed IPC to move the window during drag
  - surface left/right motion state to the renderer
- Expected output:
  - the pet can be dragged freely
  - drag direction can drive visible movement state
- Verification:
  - targeted UI test or manual verification path
  - `npm run typecheck`

### T3. Tighten basic pet aliveness

- Status: `待执行`
- Scope:
  - keep or refine blink / idle loop
  - make cursor contact trigger a visible reaction
  - make sure the mini/compact surface still feels like one coherent pet
- Expected output:
  - the startup pet presence satisfies the minimal acceptance experience
- Verification:
  - UI smoke coverage where practical
  - manual visual verification if needed

### T4. Replace `tg_url` local extraction with note-runner routing

- Status: `待执行`
- Scope:
  - stop treating every Telegram URL as local article text extraction
  - add URL classification into `video` or `article`
  - route to the correct external skill flow
- Expected output:
  - `tg_url` becomes a note-handoff path instead of a generic digest path
- Verification:
  - targeted unit tests for routing
  - regression check for Telegram parsing

### T5. Build the vault note runner boundary

- Status: `待执行`
- Scope:
  - run `video-to-note` for video URLs
  - run `article-to-note` for article URLs
  - operate against `/Users/mac/my-obsidian-vault`
  - ingest the produced markdown artifact afterward
  - capture completion status and artifact information
- Expected output:
  - deterministic runner behavior with explicit success/failure reporting
- Verification:
  - runner-level test or probe
  - artifact path capture confirmed
  - completion report confirmed

### T6. Final reporting and verification

- Status: `待执行`
- Scope:
  - ensure the system reports task completion and produced artifacts back to the user
  - run repo verification
- Expected output:
  - final delivery includes status + artifact reporting
- Verification:
  - `npm run typecheck`
  - `npm run test:workflow`
  - any new targeted tests

## Execution Order

1. `T1` freeze boundary
2. `T2` controlled drag path
3. `T3` basic pet aliveness polish
4. `T4` Telegram URL rerouting
5. `T5` vault note runner
6. `T6` final verification and reporting

## Blockers / Smallest Next Move

Current blocker status:
- `待执行` only; no active hard blocker yet

Most likely blocker:
- the exact external command path for launching Claude + skill execution in `/Users/mac/my-obsidian-vault`

If blocked there, the smallest next move is:
- capture the exact command contract for invoking Claude with `video-to-note` and `article-to-note` in that vault directory before implementation starts
