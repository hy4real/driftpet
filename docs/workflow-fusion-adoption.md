# Workflow Fusion Adoption For driftpet

## Verdict

`workflow-fusion` can fit this repo well as a thin protocol layer.
It should not replace the existing `.omx` workflow.

The current repo already has:

- persistent execution state in `.omx/state/`
- plan artifacts in `.omx/plans/`
- human-facing progress docs in `docs/`
- verification outputs under `reports/`

`workflow-fusion` adds value where the repo is currently lighter:

- a stable task-packet contract for non-trivial work
- a fixed report shape that can be guard-checked
- append-only runtime events for task transitions

## Why Full Replacement Would Be Wrong

`workflow-fusion` does not provide the repo's current planning or iteration loop.
It has no native concept of the existing Ralph state, overnight PRD/test-spec, or OMX runtime memory.

If we treated it as the new source of truth, the repo would end up with two competing orchestrators:

- `.omx` for actual execution state
- `.workflow/runtime` for a second, manually maintained copy

That is drift by design.

## Recommended Shape

Keep these boundaries:

- `.omx/` remains the execution source of truth
- `docs/` remains the durable human-facing narrative
- `reports/` remains the verification output area
- `.workflow/runtime/` becomes an exported projection for structured task packets, dispatches, reports, and events

In practice, use `workflow-fusion` for:

1. packaging a non-trivial task before execution
2. constraining worker reports to a fixed shape
3. logging lifecycle events that are easy to diff and grep

Do not use it for:

1. replacing `.omx/state/*`
2. replacing `.omx/plans/*`
3. replacing overnight verification artifacts

## Migration Landed In This Repo

This repo now includes:

- `workflow-fusion/` as the portable protocol package
- `workflow-fusion/driftpet.config.json` as the repo-specific bridge config
- `scripts/workflow-fusion-bridge.mjs` as the bridge CLI
- `scripts/workflow-fusion-bridge.test.mjs` as zero-dependency regression coverage for bridge shaping logic
- `scripts/install-git-hooks.mjs` to opt this repo into `.githooks/`
- `npm run workflow:refresh` to refresh projection, guards, verification, latest report, and events
- `npm run workflow:status` to inspect the current bridge state
- `npm run workflow:check` to fail fast when the workflow projection is stale or blocked

## Enforcement

Local:

- `.githooks/pre-commit` runs `npm run workflow:check`
- `.githooks/commit-msg` runs `node scripts/validate-lore-commit.mjs "$1"`
- install it with `npm run hooks:install`

CI:

- `.github/workflows/workflow-health.yml` runs `npm ci`, `npm run workflow:refresh`, and `npm run workflow:check`
- this makes stale or blocked workflow state fail pull requests instead of silently drifting

The generated files live under:

- `.workflow/runtime/tasks/driftpet-overnight-loop.json`
- `.workflow/runtime/state/orchestrator.json`
- `.workflow/runtime/reports/driftpet-overnight-loop-dispatch.md`
- `.workflow/runtime/reports/driftpet-overnight-loop-latest.md`
- `.workflow/runtime/events/task-events.jsonl`
- `.workflow/runtime/status.json`

## Operating Rule

Whenever the active overnight-loop goal changes enough to matter, rerun:

```bash
npm run workflow:refresh
```

That single command now:

1. syncs the current `.omx` task into `.workflow/runtime`
2. validates the dispatch
3. runs Lore + bridge regression tests plus repo verification commands
4. generates the latest structured report
5. validates the report
6. appends lifecycle events

## Remaining Gap

The current bridge is one-way:

- `.omx` -> `.workflow/runtime`

That is intentional.
Two-way sync would raise the risk of hidden state conflicts.
