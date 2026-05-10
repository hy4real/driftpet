# Docs Index

This folder mixes active workflow guidance with dated product snapshots.
Use this index to tell what is current source-of-truth versus what is historical context.

## Current sources of truth

- `../README.md`
  Current local setup, runtime configuration, and product surface summary.
- `../CLAUDE.md`
  Repo execution contract and verification format for agent work in this repo.
- `../constitution.md`
  Durable product and engineering constraints.
- `sdd-workflow.md`
  How this repo currently uses SDD packets under `feedbacks/sdd/`.
- `manual-verification-resume-dispatch.md`
  Current manual QA checklist for remembered-thread resume, thread-mode dispatch, and Claude Code dispatch.
- `plan-remaining.md`
  Current remaining product-work order after the completed Telegram/note-workflow hardening pass.

## Active work packets

- `../feedbacks/sdd/driftpet-phase1/spec.md`
- `../feedbacks/sdd/driftpet-phase1/plan.md`
- `../feedbacks/sdd/driftpet-phase1/tasks.md`
- `../feedbacks/sdd/thread-mode/spec.md`
- `../feedbacks/sdd/thread-mode/plan.md`
- `../feedbacks/sdd/thread-mode/tasks.md`

These are the active packet files. They outrank older narrative docs when there is overlap.

## Historical snapshots

- `overnight-goal-2026-05-06.md`
- `two-week-progress.md`
- `product-positioning-2026-05-08.md`
- `product-survival-plan-2026-05-08.md`
- `product-viability-2026-05-08.md`

These are useful background records, not the current operational source of truth.
Keep them for context, but update the active sources above when reality changes.

## Editing rule

If code or runtime behavior changes:

1. Update `README.md` when setup, commands, or runtime configuration change.
2. Update `CLAUDE.md` or `constitution.md` when repo rules or constraints change.
3. Update the relevant `feedbacks/sdd/...` packet when active scoped work changes state.
4. Only update dated historical docs if you are intentionally revising the historical record.
