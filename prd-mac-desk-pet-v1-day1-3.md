# PRD: Mac Desk Pet V1 Day 1-3 Technical Plan

## Goal
Build the smallest local-only Mac desk pet that can:

- receive forwarded material from a Telegram bot
- turn that material into a digest card
- show the card in a corner pet UI
- keep a small local history of recent cards

Day 1-3 stop before real extraction and real LLM output. The goal for this slice is to lock the shell, persistence, and ingest boundary.

## Product Scope

### In Scope
- Single-user, single-Mac runtime
- One always-on-top pet window with a speech bubble
- One history drawer showing recent cards
- SQLite persistence for `items`, `cards`, `events`, and `prefs`
- Telegram long polling for text and URL messages
- A fake digest pipeline that produces deterministic placeholder cards

### Out of Scope
- Passive state sensing
- Browser integration
- Video subtitles
- Cross-device sync
- Topic, people, and project taxonomies
- Rich animation beyond basic idle / speaking / collapsed states

## Key Decisions

### Runtime
Use `Electron + React + TypeScript` for MVP speed.

Reason:
- one JavaScript runtime is simpler than splitting logic across Rust and Node on day 1
- `better-sqlite3`, Telegram polling, extraction, and LLM HTTP calls all fit naturally in the Electron main process
- renderer stays UI-only

### Process Boundary
Keep all ingest logic in the Electron main process for Day 1-3.

Do not introduce a Node child process yet.

Only split to a sidecar later if one of these becomes true:
- extraction blocks UI responsiveness
- polling / ingest needs supervised restart behavior
- packaging constraints force separation

### Local-Only Bot Operation
Use Telegram `getUpdates` long polling from the local app.

No custom server.

### Secrets
For Day 3, load `TELEGRAM_BOT_TOKEN` from a local env file or shell env.

Do not store secrets in SQLite during MVP.

## Core Flow
`Telegram message -> items row -> fake digest card -> cards row -> renderer notification -> bubble + history update`

By the end of Day 3, this flow should work for:
- plain text
- a message containing one URL

## Repo Shape

Create the project with this structure:

```text
desk-pet/
  package.json
  tsconfig.json
  electron/
    main.ts
    preload.ts
    ipc.ts
  src/
    renderer/
      App.tsx
      styles.css
      components/
        PetBubble.tsx
        HistoryDrawer.tsx
        PetShell.tsx
    main/
      app/
        bootstrap.ts
        windows.ts
      db/
        client.ts
        migrate.ts
        migrations/
          001_init.sql
      ingest/
        ingest.ts
        fake-card.ts
      telegram/
        poller.ts
        parse-message.ts
      types/
        item.ts
        card.ts
        ipc.ts
  prompts/
    digest-card.v1.md
    pet-remark.v1.md
    rerank-related.v1.md
  data/
    app.db
```

## Renderer / Main Boundary

### Main process owns
- app lifecycle
- SQLite access
- Telegram polling
- ingest pipeline
- event emission to renderer

### Renderer owns
- pet shell layout
- bubble rendering
- history drawer rendering
- user-triggered UI actions

### IPC channels
- `pet:show-demo`
- `cards:list-recent`
- `cards:get-by-id`
- `ingest:manual-text`
- `events:subscribe-card-created`

Do not expose raw SQL or generic invoke channels.

## Database Schema

Use this initial migration:

```sql
CREATE TABLE items (
  id INTEGER PRIMARY KEY,
  source TEXT NOT NULL,
  raw_url TEXT,
  raw_text TEXT,
  extracted_title TEXT,
  extracted_text TEXT,
  content_hash TEXT,
  tg_message_id TEXT,
  received_at INTEGER NOT NULL,
  status TEXT NOT NULL,
  last_error TEXT
);

CREATE UNIQUE INDEX idx_items_content_hash ON items(content_hash);

CREATE TABLE cards (
  id INTEGER PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES items(id),
  title TEXT,
  use_for TEXT,
  knowledge_tag TEXT,
  summary_for_retrieval TEXT,
  related_card_ids TEXT,
  pet_remark TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,
  payload TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE prefs (
  key TEXT PRIMARY KEY,
  value TEXT
);
```

Notes:
- `content_hash` prevents duplicate ingest from repeated forwards.
- `last_error` is required for debugging failed extraction and failed card generation.
- `related_card_ids` stays JSON text until retrieval stabilizes.

Add `sqlite-vec` only when real retrieval lands. It is not required to finish Day 1-3.

## Card Contract

The app should standardize on this TypeScript contract before real prompts are added:

```ts
export type RelatedCardRef = {
  cardId: number;
  title: string;
  reason: string;
};

export type CardRecord = {
  id: number;
  itemId: number;
  title: string;
  useFor: string;
  knowledgeTag: string;
  summaryForRetrieval: string;
  related: RelatedCardRef[];
  petRemark: string;
  createdAt: number;
};
```

Rules:
- `useFor`: 1-2 concrete sentences, never generic summary filler
- `knowledgeTag`: one short label or sentence
- `summaryForRetrieval`: concise semantic gist for later embedding
- `petRemark`: one sentence, short enough for the bubble

## Fake Digest Contract

Day 2 and Day 3 should not call any real model. Use one deterministic fake generator:

- if input is plain text, title is first 60 chars
- `useFor` says what the item could become next
- `knowledgeTag` is a static placeholder like `captured note`
- `summaryForRetrieval` is the normalized input
- `petRemark` uses the same voice every time

The point is to stabilize the pipeline shape before prompt work starts.

## Day 1

### Goal
Ship the pet shell and local demo event path.

### Build
- bootstrap Electron app
- create frameless transparent always-on-top window
- anchor window to lower-right corner
- make pet shell draggable
- add bubble component
- add empty history drawer component
- wire `pet:show-demo` to display a fake card payload

### Files
- `electron/main.ts`
- `electron/preload.ts`
- `src/renderer/App.tsx`
- `src/renderer/components/PetShell.tsx`
- `src/renderer/components/PetBubble.tsx`
- `src/renderer/components/HistoryDrawer.tsx`
- `src/main/types/ipc.ts`

### Acceptance
- app launches from local dev command
- pet window stays above normal windows
- a demo IPC call shows a bubble with fake card content
- history drawer opens and closes even with placeholder content

## Day 2

### Goal
Lock the database and ingest skeleton.

### Build
- add SQLite client and migration runner
- create `001_init.sql`
- create `ingestManualText(rawText)` in main process
- write one `items` row and one fake `cards` row
- write one `events` row for `card_created`
- notify renderer after card creation
- load last 20 cards into history drawer

### Files
- `src/main/db/client.ts`
- `src/main/db/migrate.ts`
- `src/main/db/migrations/001_init.sql`
- `src/main/ingest/ingest.ts`
- `src/main/ingest/fake-card.ts`
- `src/main/types/item.ts`
- `src/main/types/card.ts`

### Acceptance
- invoking `ingest:manual-text` persists an item and a fake card
- renderer receives the new card event and shows the bubble
- reopening the app still shows the created card in history

## Day 3

### Goal
Replace manual input with Telegram text / URL ingest.

### Build
- add Telegram polling loop with persisted offset handling
- parse text-only and URL-containing messages
- compute `content_hash` before insert
- ignore duplicates cleanly
- send parsed message into the same ingest pipeline from Day 2
- keep fake card generation in place

### Files
- `src/main/telegram/poller.ts`
- `src/main/telegram/parse-message.ts`
- `src/main/app/bootstrap.ts`

### Acceptance
- sending a text message to the bot creates a local item and fake card
- sending a URL message does the same
- restarting the app does not re-process already handled messages
- duplicate forwards do not create duplicate items

## Risks

### UI polish drift
Mitigation: lock the renderer to one pet shell, one bubble, one history drawer.

### Main process bloat
Mitigation: keep modules separated even if they run in one process.

### Telegram offset bugs
Mitigation: persist last offset in `prefs` and update only after successful ingest.

### Premature retrieval complexity
Mitigation: no embeddings and no rerank before the real card pipeline works.

## Verification

### End of Day 1
- manual demo bubble appears
- window position and always-on-top behavior feel stable

### End of Day 2
- one manual ingest persists to SQLite
- app restart preserves recent history

### End of Day 3
- Telegram message triggers the same pipeline path as manual ingest
- no duplicate item row on repeated forward of identical content

## Next After Day 3
- Day 4: article extraction
- Day 5: real digest prompt
- Day 6: embeddings and related recall
- Day 7: live use and prompt tuning

## ADR

### Decision
Build the MVP on Electron, keep logic local, and defer passive sensing and retrieval sophistication.

### Drivers
- fastest path to a working local product
- lowest operational surface area
- easiest way to validate the real product loop before adding intelligence layers

### Alternatives Considered
- `Tauri + Rust + Node`: better long-term packaging, slower for MVP because of split runtime work
- `Tauri only`: cleaner binary story, slower for Telegram + SQLite + prompt iteration
- `Server-backed bot`: easier remote availability, adds deployment and ops before product value is proven

### Why Chosen
The first proof point is not architecture elegance. It is whether a forwarded item can become a useful on-screen card fast enough to feel alive.

### Consequences
- packaging can be revisited later
- main process discipline matters early
- some future refactor cost is accepted to cut MVP time

### Follow-Ups
- revisit `sqlite-vec` after real card generation exists
- move secrets to a stronger local store only after MVP loop works
- evaluate sidecar split only if main process load becomes visible
