# driftpet v0.2 Workline Lifecycle MVP Plan

Date: 2026-05-16

North star:

> 用户不处理卡片时，driftpet 也不能把它们变成新的心理债务。

## Requirements Summary

driftpet v0.2 should move from "capture fragments" to "guard a few still-alive work lines." The user-facing model is intentionally smaller than the engineering model.

User-facing actions:

- `继续守着`
- `明天接`
- `沉淀`
- `放下`

Hidden engineering states may exist, but UI must not expose words like `hot`, `waiting`, `cooling`, `archived`, or `dropped`.

Default rules:

- New cards default to `cooling` with a today TTL, not `hot`.
- Foreground hot work lines are capped at 3, hard-coded for v0.2.
- `放下` is recoverable for 7 days.
- `沉淀`, `放下`, and background history do not increase pet anxiety/load.
- Daily close-line prompt appears at most once per day and must allow `今天先不问`.
- `明天接` can actively float once tomorrow. If untouched, it cools down rather than becoming an infinite snooze.
- `今天稍后再看` never bypasses the hot cap; it goes to today cooling.

## Current Code Facts

- The initial schema has `items.status` for ingest lifecycle and `cards` without card lifecycle fields: `src/main/db/migrations/001_init.sql:1`, `src/main/db/migrations/001_init.sql:19`.
- Cards currently only gained `thread_cache_json` later: `src/main/db/migrations/010_thread_cache_json.sql:1`.
- `CardRecord` has no lifecycle/TTL/recovery fields yet: `src/main/types/card.ts:21`.
- `getRememberedThread` currently selects the newest real card that is not an excluded tag, with a release watermark preference: `src/main/status/app-status.ts:250`.
- Pet load/auto-surface is currently hourly-budget/cooldown based, not lifecycle-count based: `src/main/pet/runtime.ts:98`.
- Card creation writes only digest/thread fields and does not assign lifecycle: `src/main/ingest/ingest.ts:281`.
- Workbench already has a soft `先放下` path, but it maps to a remembered-thread release pref, not a durable lifecycle state: `src/renderer/App.tsx:629`.
- History still uses inbox-like/destructive language such as `删除`: `src/renderer/components/HistoryDrawer.tsx:117`.
- Package description still frames the app as a cute desktop companion that collects fragments: `package.json:5`.

## PR Gate

Every v0.2 PR must answer these four checks before merge:

1. Will this make old data suddenly look like task debt?
2. Will this make `明天接` become infinite snooze?
3. Will this make `放下` become a second inbox?
4. Will this make the pet anxious because of archived/dropped/background history?

If any answer is yes, the PR should not merge.

## Data Model Plan

Add a migration after `010_thread_cache_json.sql`.

Recommended columns on `cards`:

- `lifecycle_status TEXT NOT NULL DEFAULT 'cooling'`
- `ttl_at INTEGER`
- `recover_until INTEGER`
- `thread_id TEXT`
- `last_touched_at INTEGER`
- `tomorrow_float_at INTEGER`
- `tomorrow_floated_at INTEGER`

Recommended constraints/indexes:

- `CHECK (lifecycle_status IN ('hot', 'waiting', 'cooling', 'archived', 'dropped'))`
- Index `(lifecycle_status, ttl_at)`
- Index `(recover_until)`
- Index `(thread_id)`

Migration policy:

- Existing cards migrate to `cooling + today`.
- Existing cards do not count toward the hot cap.
- Existing cards do not affect pet anxiety/load on first launch after upgrade.
- Preserve old card visibility in history/search, but do not surface them as a debt queue.

## State Machine

Create a small domain module, likely `src/main/workline/lifecycle.ts`, with pure functions plus database wrappers.

State transitions:

- New card: `cooling`, `ttl_at=endOfToday`, `last_touched_at=now`.
- `继续守着`: `hot` if no active `threadCache.waitingOn`; `waiting` if active waiting exists; `ttl_at=endOfToday`; subject to the hot cap.
- `明天接`: `waiting`, `ttl_at=endOfTomorrow`, set `tomorrow_float_at=startOfTomorrow`.
- Tomorrow float consumed: set `tomorrow_floated_at=now`.
- Tomorrow untouched after float: transition to `cooling`, do not re-float daily.
- `沉淀`: `archived`, clear `recover_until`, not in pet load.
- `放下`: `dropped`, `recover_until=now+7d`, not in pet load.
- Recovery before expiry: return to `cooling + today`, not directly hot.
- Recovery after expiry: unavailable from recovery entry.
- `今天先不问`: mark daily close-line skipped for today; touched cards move/remain `cooling`, not hot.

Use an event row for lifecycle changes where useful:

- `workline_lifecycle_changed`
- `daily_close_line_shown`
- `daily_close_line_skipped`
- `hot_cap_choice_made`

## API / IPC Plan

Add lifecycle IPC handlers instead of overloading delete/release:

- `workline:list-active`
- `workline:list-close-line-candidates`
- `workline:update-lifecycle`
- `workline:recover-dropped`
- `workline:get-hot-cap-choice`

Keep v0.2 narrow:

- No permanent inbox API.
- No custom TTL API.
- No external archived integration.

## UI Plan

Package entry:

- Change `package.json` description to:
  `Mac 工作记忆守护型桌宠，帮你守住、衰减并放下还没来得及沉淀的工作线。`

Workbench:

- Rename "放下的线" history concept away from a visible debt list.
- Empty state: `现在没有需要我替你守着的线。`
- Resume strip actions become the four user verbs: `继续守着`, `明天接`, `沉淀`, `放下`.
- Do not show engineering states.

Daily close-line panel:

- Tone: `这些我今天还要继续替你守吗？`
- Include `今天先不问`.
- Must not say `你还有这些没处理`.
- Must not repeat after skip that day.

Hot cap modal:

Text:

`我已经在帮你守 3 条线了。这张要替换哪一条，还是先放到今天稍后再看？`

Choices:

- Replace one current hot line.
- `今天稍后再看` -> cooling, not hot.
- `直接放下` -> dropped with 7-day recovery.

Dropped recovery:

- Low-presence entry only.
- Do not show counts like "you dropped N things."
- Do not make recovery a second inbox.

## Implementation Sequence

1. **Spec + first nail**
   - Commit this v0.2 plan.
   - Update `package.json:5` description.
   - Add a text regression test for banned/approved lifecycle wording.

2. **Data migration and types**
   - Add card lifecycle columns.
   - Extend `CardRecord` and row mappers.
   - Add migration tests proving old cards become `cooling + today` and do not count as hot.

3. **Lifecycle domain module**
   - Implement pure transition functions and DB wrappers.
   - Add unit tests for all state machine transitions.
   - Include clock injection so today/tomorrow/7-day tests are deterministic.

4. **Status and pet load**
   - Replace `getRememberedThread` newest-card selection with active lifecycle selection.
   - Add lifecycle counts to `AppStatus` if needed, but do not expose engineering labels to user UI.
   - Ensure archived/dropped/background history is ignored by pet anxiety/load.

5. **Workbench action wiring**
   - Add the four user actions.
   - Convert existing `releaseRememberedThread` behavior into durable `放下`.
   - Keep `删除` out of the primary lifecycle path. Destructive delete can remain an advanced/history action only if needed.

6. **Hot cap flow**
   - Enforce hot max 3 in backend first.
   - Add replacement/稍后/放下 modal in Workbench.
   - Test that `今天稍后再看` cannot become hot.

7. **Daily close-line**
   - Candidate query: today-expired active/cooling foreground-near cards only.
   - Show once per day.
   - `今天先不问` writes a same-day suppression marker.
   - Tomorrow/snooze rules tested.

8. **Recovery**
   - Low-presence dropped recovery entry.
   - 7-day expiry test.
   - Recovery returns to cooling, not hot.

9. **Final copy and regression sweep**
   - Run banned wording scan.
   - UI smoke across empty state, hot cap, daily close-line, recovery, and archive/drop.
   - Real-use probe: 3-day simulated feed, 10-20 cards/day.

## Acceptance Criteria

Data and migration:

- Old cards migrate to `cooling + today`.
- Old cards do not enter hot cap calculation.
- Old cards do not make pet load/anxiety worse after migration.

State machine:

- New card -> `cooling + today`.
- `继续守着` -> `hot` or `waiting` and is limited by max 3 hot lines.
- `明天接` floats once tomorrow.
- Untouched `明天接` line becomes cooling after its float window.
- `沉淀` and `放下` do not count toward pet load.
- `放下` creates a 7-day recovery window.
- Expired recovery is unavailable.

Daily close-line:

- Shows at most once per day.
- `今天先不问` suppresses same-day repetition.
- Copy asks whether driftpet should continue guarding, not whether user has unfinished debt.
- Archived/dropped cards are never pulled back for judgment.

Hot cap:

- Hot max is 3.
- Fourth hot line requires replace / later / drop.
- Later choice writes cooling only.

Copy:

- Avoid: `待处理`, `未完成`, `清理`, `过期`, `删除`.
- Prefer: `继续守着`, `明天接`, `沉淀`, `放下`, `今天先不问`, `需要时还能找回`.

Product acceptance:

- After 3 simulated days of 10-20 real captures/day, opening on day 4 feels like "it kept the few lines I should resume", not "I have a new backlog."

## Verification Plan

Unit:

- Lifecycle pure transition tests.
- Migration tests.
- Hot cap selection tests.
- Tomorrow-float-once tests.
- Recovery-expiry tests.

Integration:

- Ingest creates cooling today card.
- Status returns active lines from lifecycle, not newest-card fallback.
- Pet load excludes archived/dropped.
- Daily close-line suppression persists through app restart.

UI smoke:

- Empty state copy.
- Four lifecycle actions.
- Hot cap modal.
- Daily close-line with `今天先不问`.
- Dropped recovery low-presence entry.
- Archived list/search if included.

Static copy check:

- Fail if primary v0.2 UI contains banned words.
- Allow exceptions only in developer-facing tests/docs.

Manual:

- Seed 60 cards across 3 simulated days, including no user cleanup.
- Confirm day 4 opens to at most 3 guarded lines and no debt-count language.

## Risks And Mitigations

- **Migration debt shock**: old data becomes a huge queue.
  - Mitigation: default old cards to cooling today and exclude from hot cap/pet load.
- **Snooze loop**: `明天接` becomes infinite postponement.
  - Mitigation: one active float, then cooling until next daily close-line.
- **Dropped inbox**: recovery becomes a visible backlog.
  - Mitigation: low-presence entry, no counts, expiry after 7 days.
- **UI state leakage**: users see engineering names.
  - Mitigation: wording scan and typed UI label mapping.
- **Feature creep through archive**: `沉淀` turns into Obsidian/task integrations.
  - Mitigation: v0.2 archive is local list/search only.
- **Hot cap bypass**: `今天稍后再看` becomes hidden hot.
  - Mitigation: backend cap enforcement and tests.

## Resolved Product Decision

Daily close-line prompt placement:

- Show it inside the Workbench the first time the user opens the nest on a given day.
- Do not show it as an automatic desktop interruption on app launch.
- Rationale: this better matches "帮你夹书签" and lowers debt pressure.

## Agent Handoff Snapshot

Last updated: 2026-05-16.

North-star gate for every next change:

> 用户不处理卡片时，driftpet 也不能把它们变成新的心理债务。

What is already implemented in the current working tree:

- `package.json` description now frames driftpet as a Mac work-memory guardian.
- Card lifecycle migration exists at `src/main/db/migrations/011_card_lifecycle.sql`.
- Lifecycle domain module exists at `src/main/workline/lifecycle.ts`.
- `CardRecord`, card row mapping, ingest, status, IPC, preload, and renderer types know about lifecycle fields.
- New cards start as `cooling + today`; legacy cards migrate to `cooling + today`.
- `继续守着`, `明天接`, `沉淀`, `放下`, `今天稍后再看`, and `recover` are wired through backend + renderer.
- Remembered thread selection reads active lifecycle lines instead of newest-card fallback.
- `明天接` does not float today, floats once tomorrow, then cools down if untouched.
- Daily close-line is shown only inside Workbench and supports `今天先不问`.
- Hot cap is enforced at 3 active hot lines, with Workbench choice UI for replace / later / drop.
- Dropped recovery is low-presence in history via `需要时找回`, returning to cooling rather than hot.

Tests added or updated:

- `scripts/workline-lifecycle.test.mjs`
- `scripts/v02-product-copy.test.mjs`
- `scripts/remembered-thread-release.test.mjs`
- `scripts/app-ui-smoke.test.mjs`

Last known verification:

- `npm run typecheck`
- `npm run test:workline-lifecycle`
- `npm run test:remembered-release`
- `npm run test:v02-copy`
- `npm run test:ui-smoke`
- `npm run build`
- `git diff --check` over the v0.2 touched files

Recommended next agent entry point:

1. Start by reading this handoff, then inspect `src/main/workline/lifecycle.ts`, `src/main/status/app-status.ts`, and `src/renderer/components/PetWorkbench.tsx`.
2. Run `npm run typecheck` and `npm run test:workline-lifecycle` before changing behavior.
3. Implement the remaining v0.2 hardening in this order:
   - Add a deterministic 3-day simulated feed fixture: 10-20 captures/day, little or no user cleanup, day 4 opens to at most 3 guarded lines and no debt-count copy.
   - Tighten primary UI copy scan so lifecycle-facing surfaces avoid `待处理`, `未完成`, `清理`, `过期`, `删除`; allow developer/history destructive delete only as an explicit exception.
   - Review empty states and labels so Workbench says `现在没有需要我替你守着的线。` when no active guarded line exists.
   - If broadening archive/search, keep `沉淀` local and low-load; do not add Obsidian/task integrations in v0.2.
4. Do not add settings for hot cap or custom TTL in v0.2.
5. Do not make dropped recovery a second inbox: no dropped counts, no prominent dropped list, no pressure copy.

Known caveats:

- The implementation is in a dirty working tree with other unrelated project changes; do not revert files outside the touched v0.2 scope.
- `HistoryDrawer` still has an explicit destructive delete action. It is not the primary lifecycle path; changing or hiding it should be a separate copy/UX decision with regression tests.
- The current tests cover lifecycle transitions, UI smoke, and build. They do not yet simulate the full 3-day acceptance scenario.
