# Thread Mode Tasks

Spec reference:
- `feedbacks/sdd/thread-mode/spec.md`

Plan reference:
- `feedbacks/sdd/thread-mode/plan.md`

Status legend:
- `待执行`
- `执行中`
- `待验收`
- `已通过`
- `未通过`
- `阻塞`
- `作废`

## Task List

### T1. Freeze first-version scope

- Status: `已通过`
- Scope:
  - keep v1 to a derived thread bundle
  - avoid new schema and broad UI redesign
- Expected output:
  - approved SDD packet for thread mode
- Verification:
  - packet review against `docs/sdd-workflow.md`

### T2. Add shared thread-bundle derivation

- Status: `已通过`
- Scope:
  - derive bundle members from anchor / related / backlink / same-tag signals
  - filter generic workflow tags from same-tag matching
- Expected output:
  - one reusable pure helper for both renderer and main
- Verification:
  - `node --test --experimental-strip-types src/shared/thread-bundle.test.mjs`

### T3. Add thread-aware Claude dispatch

- Status: `已通过`
- Scope:
  - keep single-card dispatch
  - add explicit whole-thread dispatch
  - extend prompt with dispatch mode and active thread bundle
- Expected output:
  - separate `thread` dispatch path
  - prompt carries explicit thread context
- Verification:
  - `npm run test:claude-dispatch`

### T4. Expose thread mode in the workbench

- Status: `已通过`
- Scope:
  - show a thread panel in expanded workbench
  - allow selecting cards from that panel
  - add `派给 Claude Code（整条线）`
- Expected output:
  - thread continuity becomes visible and actionable in UI
- Verification:
  - `npm run test:ui-smoke`

### T5. Sync minimal docs

- Status: `已通过`
- Scope:
  - update active source-of-truth docs affected by this slice
- Expected output:
  - README / docs index / manual QA stay aligned with shipped behavior
- Verification:
  - manual review

## Blockers / Smallest Next Move

Current blocker status:
- 无自动化阻塞

Smallest next move if live behavior differs:
- inspect the generated Claude prompt file from one whole-thread dispatch and compare it to the single-card dispatch output
