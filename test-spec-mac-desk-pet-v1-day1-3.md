# Test Spec: Mac Desk Pet V1 Day 1-3

## Goal
Verify that the first three workdays establish a stable local shell, persistence layer, and Telegram ingest path.

## Test Scope
- Electron window shell and renderer interactions
- SQLite migration and persistence
- Manual ingest path
- Telegram long polling ingest path
- Duplicate prevention

## Day 1 Verification

### Manual checks
- Launch the app in dev mode and confirm a transparent frameless pet window appears.
- Confirm the pet window stays above ordinary app windows.
- Trigger a demo card event and confirm the bubble renders title, `useFor`, `knowledgeTag`, and `petRemark`.
- Open and close the history drawer.

### Evidence to collect
- Screenshot of the pet bubble
- Screenshot of the empty or placeholder history drawer

## Day 2 Verification

### Functional checks
- Trigger `ingest:manual-text` with a sample note.
- Confirm one new `items` row exists.
- Confirm one new `cards` row exists and references the item.
- Confirm one `events` row exists with a card-created event.
- Restart the app and confirm the recent card still appears in history.

### Suggested checks
- Inspect the SQLite file with any local DB browser or a simple query runner.
- Confirm `status = 'digested'` on success.
- Confirm `last_error` is empty on success.

## Day 3 Verification

### Functional checks
- Send a plain text message to the Telegram bot and confirm it creates one item and one card.
- Send a message containing one URL and confirm it also creates one item and one card.
- Restart the app and confirm the poller does not replay already processed updates.
- Forward the same message again and confirm duplicate prevention blocks a second item row when `content_hash` matches.

### Failure checks
- Remove or invalidate `TELEGRAM_BOT_TOKEN` and confirm the app surfaces a clear local error state.
- Simulate an ingest error and confirm `items.last_error` is populated.

## Acceptance Criteria
- Day 1 is complete when the renderer can show a fake card from an IPC trigger.
- Day 2 is complete when one manual ingest survives app restart and appears in history.
- Day 3 is complete when Telegram input uses the same ingest path and duplicate prevention works.

## Out of Scope for These Tests
- Real article extraction
- Real LLM prompts
- Embeddings or related-card retrieval
- Passive state sensing

## Risks
- Window behavior may vary across macOS spaces or fullscreen apps.
- Telegram long polling can duplicate work if offset persistence is wrong.
- Manual tests alone will miss race conditions in restart and shutdown edges.

## Follow-Up Tests After Day 3
- Day 4: article extraction fallback behavior
- Day 5: prompt JSON validation and malformed model output handling
- Day 6: similarity threshold tuning for related-card recall
