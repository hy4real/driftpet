# Runtime Schema

## Files

Recommended runtime files:

```text
.workflow/runtime/
├─ events/
│  └─ task-events.jsonl
├─ tasks/
│  └─ 0507T001.json
├─ state/
│  └─ orchestrator.json
└─ reports/
   └─ 0507T001-latest.md
```

## Event envelope

Each JSONL line should match this shape:

```json
{
  "v": 1,
  "ts": "2026-05-07T09:00:00.000Z",
  "event_id": "evt_0001",
  "type": "TASK_ROUTED",
  "from": "orchestrator",
  "to": "executor",
  "task_id": "0507T001",
  "state": "ROUTE_OR_EXECUTE",
  "external_status": "待执行",
  "severity": "info",
  "caused_by": "user_request",
  "evidence_refs": [],
  "payload": {
    "summary": "task packet created and dispatched"
  }
}
```

## Suggested event types

- `TASK_INTAKED`
- `TASK_CLASSIFIED`
- `TASK_PACKET_WRITTEN`
- `TASK_ROUTED`
- `SUBAGENT_RESULT_RECEIVED`
- `REPORT_VALIDATED`
- `REPORT_BLOCKED`
- `QA_REQUESTED`
- `QA_ACCEPTED`
- `QA_REJECTED`
- `TASK_DONE`
- `TASK_BLOCKED`
- `TASK_VOIDED`

## State file

Suggested orchestrator state shape:

```json
{
  "task_id": "0507T001",
  "current_state": "REVIEW",
  "external_status": "待验收",
  "updated_at": "2026-05-07T09:12:00.000Z",
  "active_agent": "orchestrator",
  "next_step": "dispatch QA acceptance",
  "risk": [
    "report passed format guard but QA not yet written"
  ]
}
```
