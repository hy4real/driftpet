# Codex / Claude Adoption

## Goal

Use one workflow contract across both Codex and Claude without depending on vendor-specific plugins.

## Codex

Recommended usage:

1. Put project-wide rules in `AGENTS.md`.
2. Keep `AGENTS.md` thin.
3. Store structured task packets in `.workflow/runtime/tasks/`.
4. Before trusting a worker report, run `scripts/response-guard.mjs`.
5. Append lifecycle events to `.workflow/runtime/events/task-events.jsonl`.

Recommended `AGENTS.md` pattern:

- root file contains scope, routing, and runtime paths
- detailed protocol lives in `workflow-fusion/docs/`
- tasks are passed as structured packets, not just free-form paragraphs

## Claude

Recommended usage:

1. Put project entry rules in `CLAUDE.md` or the project instructions file you already use.
2. Link to `workflow-fusion/docs/workflow-spec.md`.
3. When starting a new task, paste or attach the task packet.
4. Require the worker answer to follow `templates/report-template.md`.
5. Validate the produced report with `scripts/response-guard.mjs`.

## Shared rules

Across both tools, keep these invariant:

- same external 7 task states
- same task packet fields
- same blocked-report rule
- same runtime JSONL envelope

## What not to do

- do not turn the root instruction file into a giant philosophical prompt
- do not rely on chat history as the only source of task state
- do not let workers answer with ad hoc formats when the task is non-trivial

## Suggested rollout

1. Start with one real task.
2. Write a task packet.
3. Save one latest report.
4. Validate it with the guard.
5. Append 3-5 lifecycle events.
6. Only then expand to more automation or more agents.
