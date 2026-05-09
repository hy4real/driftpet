# Workflow Fusion

`workflow-fusion/` is a minimal, portable workflow package that combines:

- human-readable task / report / QA templates from `workflow-kit`
- machine-readable task packets, runtime events, and protocol guards inspired by `opencode_v0_cn_enhanced_20260319`

This package is intentionally small. It does not try to replace your whole agent setup.
It gives you a stable contract for:

1. dispatching work with explicit scope and risk boundaries
2. recording runtime state as append-only JSONL
3. validating agent reports before trusting them

## Layout

```text
workflow-fusion/
├─ README.md
├─ docs/
│  ├─ codex-claude-adoption.md
│  ├─ runtime-schema.md
│  └─ workflow-spec.md
├─ scripts/
│  ├─ append-event.mjs
│  └─ response-guard.mjs
├─ templates/
│  ├─ orchestrator-task-packet.json
│  ├─ report-template.md
│  └─ task-dispatch-template.md
└─ .workflow/runtime/
   ├─ events/
   ├─ reports/
   ├─ state/
   └─ tasks/
```

## Quick start

1. Copy `templates/orchestrator-task-packet.json`.
2. Fill `goal`, `scope`, `out_of_scope`, `acceptance`, `risk_boundary`, and `report_format`.
3. Save the packet under `.workflow/runtime/tasks/<task-id>.json`.
4. Dispatch work using `templates/task-dispatch-template.md`.
5. Validate a report:

```bash
node workflow-fusion/scripts/response-guard.mjs \
  --kind report \
  --file /absolute/path/to/report.md
```

6. Append a runtime event:

```bash
node workflow-fusion/scripts/append-event.mjs \
  --file /absolute/path/to/workflow-fusion/.workflow/runtime/events/task-events.jsonl \
  --type TASK_DONE \
  --task-id 0507T001 \
  --state 已通过 \
  --from executor \
  --to orchestrator \
  --payload '{"summary":"task completed"}'
```

## What this package standardizes

- external task status:
  - `待执行`
  - `执行中`
  - `待验收`
  - `已通过`
  - `未通过`
  - `阻塞`
  - `作废`
- internal orchestrator state:
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

## Design boundary

This package does not assume a specific model vendor.

- For Codex, use the task packet and runtime JSONL as the machine contract.
- For Claude, use the same task packet and report format in `CLAUDE.md` or project docs.
- If your platform supports middleware or plugins, `response-guard.mjs` can be wrapped as a pre-display or pre-ingest validator.
