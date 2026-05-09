# Workflow Spec

This workflow is a fusion of two layers:

- protocol layer: people read and write structured templates
- runtime layer: the system stores state, tasks, reports, and events as machine-readable files

## 1. External vs internal state

External task status is user-facing and stable:

- `待执行`
- `执行中`
- `待验收`
- `已通过`
- `未通过`
- `阻塞`
- `作废`

Internal orchestrator state is machine-facing and can be richer:

- `INTAKE`
- `CLASSIFY`
- `FREEZE_MIN`
- `ROUTE_OR_EXECUTE`
- `SUBAGENT_RUNNING`
- `REVIEW`
- `USER_UPDATE`
- `DONE`
- `BLOCKED`
- `HANDOFF`

Rule:

- do not invent new external states
- it is fine to add internal routing states later

## 2. Mandatory task packet fields

Every non-trivial task should have:

- `task_id`
- `title`
- `intent`
- `goal`
- `scope`
- `out_of_scope`
- `acceptance`
- `risk_boundary`
- `current_state`
- `external_status`
- `report_format`

These fields are the minimal anti-drift contract.

## 3. BLOCKED rule

If a task is blocked, the report must include:

- blocking condition
- missing evidence or dependency
- smallest next move

A blocked report that only says "blocked" is incomplete.

## 4. Runtime separation

Human-maintained documents:

- templates
- protocol docs
- project instructions

Machine-maintained files:

- `.workflow/runtime/tasks/*.json`
- `.workflow/runtime/state/*.json`
- `.workflow/runtime/reports/*.md`
- `.workflow/runtime/events/*.jsonl`

Do not treat long chat transcripts as the source of truth for runtime state.

## 5. Response guard

The first guard checks format, not truth.

Minimum checks:

- required fields are present
- field order is stable
- `状态` is one of the allowed values
- `任务ID` exists
- blocked reports include `最小下一步`

This is the lowest-cost way to catch workflow drift before reviewing content.
