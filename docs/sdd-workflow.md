# SDD Workflow For driftpet

## Purpose

This repo will use SDD to stop product and implementation drift before code changes start.

The first goal is not "more process."
The first goal is to make non-trivial work pass through a stable path:

1. clarify the requirement,
2. freeze the spec,
3. derive the plan,
4. split execution tasks.

That path matters most when product identity, scope, or acceptance are still fuzzy.

## Canonical Artifact Set

For each non-trivial work item, create one SDD packet under:

```text
feedbacks/
└── sdd/
    └── <task-slug>/
        ├── spec.md
        ├── plan.md
        └── tasks.md
```

Use one folder per work item, not one giant shared document.

Suggested slug shape:

- `driftpet-phase1`
- `telegram-ingest-hardening`
- `pet-presence-motion`

## What Each File Must Do

### `spec.md`

Source of truth for intent.
It answers:

- what problem is being solved
- what the product should become
- what it must not become
- what counts as done

Minimum sections:

1. Context
2. Problem
3. Product intent
4. In scope
5. Out of scope
6. User-visible acceptance
7. Constraints
8. Open questions

If scope is still vague, do not start `plan.md`.

### `plan.md`

Source of truth for implementation approach.
It answers:

- which files or modules will change
- what architectural path will be used
- what sequence of implementation steps makes sense
- what verification will prove the change

Minimum sections:

1. Spec reference
2. Current codebase anchors
3. Proposed approach
4. Files and modules touched
5. Risks and rejected options
6. Verification plan

If the plan cannot point to concrete code surfaces, keep clarifying before execution.

### `tasks.md`

Source of truth for execution slicing.
It answers:

- which bounded steps exist
- what each step produces
- how each step is verified
- what is blocked or done

Minimum sections:

1. Task list with status
2. Owner or execution lane
3. Expected output
4. Verification per task
5. Blockers / smallest next move

## Status Rules

Use these external task statuses:

- `待执行`
- `执行中`
- `待验收`
- `已通过`
- `未通过`
- `阻塞`
- `作废`

Do not invent new human-facing status labels.

If a task is blocked, write:

- the blocking condition
- the missing dependency or evidence
- the smallest next move

## Boundary With Existing Repo Systems

This repo already has two important systems:

1. `.omx/` for runtime state, plans, memory, and execution context
2. `workflow-fusion/` plus `.workflow/runtime/` for structured projections, report guards, and append-only events

SDD does not replace either one.

Use them like this:

- `feedbacks/sdd/...` is the human-readable requirement and execution packet
- `.omx/` remains the execution source of truth during active work
- `.workflow/runtime/` remains a machine-readable projection and report surface

Rule:

- `spec.md`, `plan.md`, and `tasks.md` define what should happen
- `.omx/` tracks what is happening
- `.workflow/runtime/` records a structured mirror for guards and reports

## First-Phase Operating Rule

For now, no non-trivial product change should start from implementation-first discussion.

The minimum safe path is:

1. clarify through interview or direct requirement shaping
2. write `spec.md`
3. review scope and non-goals
4. only then decide whether to write `plan.md`
5. only then split into `tasks.md`

This is especially important for product-identity changes.

## When To Stop Early

Stop at `spec.md` when:

- product identity is still moving
- solution shape is still contested
- implementation would be premature

That is the current default for the driftpet repositioning work.

## Review Checklist

Before moving from `spec.md` to `plan.md`, confirm:

- the problem statement is concrete
- the desired identity is explicit
- non-goals are explicit
- phase boundary is explicit
- acceptance is user-visible
- at least one real failure example is documented

If any of the above is missing, the SDD packet is incomplete.
