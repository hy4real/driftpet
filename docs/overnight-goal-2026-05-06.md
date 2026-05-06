# Overnight Goal: driftpet Morning Brief

## Goal

Wake up to a clear, grounded handoff for driftpet V1: what is working, what the current product shape is, what to do next, and what should not be built yet.

This goal is intentionally not a feature sprint. The app already has the core loop running. The overnight task is to turn tonight's implementation and validation into a durable artifact that can steer the next day of work.

## Deliverables

- `reports/morning-brief-2026-05-07.md`
- `reports/overnight-verification-2026-05-07.json`

## Scope

The brief should cover:

- current product positioning
- verified end-to-end loop
- current local architecture
- provider setup
- Telegram status
- local Ollama memory status
- next-day work plan
- risks and traps to avoid
- exact commands for restarting and verifying

## Non-Goals

- Do not add passive state sensing.
- Do not add browser integration.
- Do not change database schema.
- Do not add new dependencies.
- Do not redesign the UI tonight.
- Do not attempt a production package build.

## Acceptance Criteria

- TypeScript checks pass.
- Electron main build passes.
- Ollama returns a vector for `qwen3-embedding:0.6b`.
- SQLite contains at least one real Telegram item.
- Recent embeddings use `provider = ollama`.
- The report states any unresolved risks instead of hiding them.

## Morning Read Order

1. `reports/morning-brief-2026-05-07.md`
2. `reports/overnight-verification-2026-05-07.json`
3. `README.md`

