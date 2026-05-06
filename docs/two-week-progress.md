# driftpet Two-Week Progress

This file tracks the original two-week V1 plan against what has actually been implemented.

## Original Core Loop

Phone sees something -> forward to Telegram bot -> desk pet shows a digest card -> card pulls in one or two related old memories.

Status: done

- Telegram long polling is live on the Mac.
- Text and URL captures are stored in local SQLite.
- Digest cards are generated locally through the configured relay path.
- Related recall uses stored embeddings and now excludes synthetic / ping noise.

## Completed Stages

### Day 1-6 foundation

Status: done

- Transparent Electron shell with React renderer
- SQLite storage
- Telegram ingestion
- URL extraction
- Digest card generation
- Embedding-backed recall

### Day 7

Status: done

- In-app health panel for Telegram / LLM / embeddings / storage

### Day 8

Status: done

- Latest capture inspection drawer

### Day 9

Status: done

- Low-signal Telegram messages downgraded to ping cards

### Day 10

Status: done

- URL extraction state surfaced instead of hiding inside generic errors

### Day 11

Status: done

- Real items and synthetic verification items are explicitly separated

### Day 12

Status: done

- URL fetch / readability failure paths are stored as structured extraction state
- Digest fallback text no longer masquerades as extracted article content

Commit: `b460c59`

### Day 13

Status: done

- `manual_chaos` is now a dedicated "I'm drifting" lane
- Chaos dumps bypass duplicate suppression
- Cards come back as main thread plus what to set aside and what to do next

Commit: `5fe06b7`

### Day 14

Status: done

- Pet modes: `focus` and `sleep`
- Hourly auto-surface budget
- Suppressed auto-surface events recorded for inspection

Commit: `32cb389`

### Day 15

Status: done

- Related recall excludes synthetic cards
- Related recall excludes Telegram ping cards
- URL token noise is reduced
- Semantic threshold is stricter

Commit: `572fc2a`

### Day 16

Status: done

- Chinese fallback copy now stays in Chinese for digest cards and chaos reset cards
- Related recall reasons now follow the input language instead of hardcoding English
- Prompt files now explicitly ask the model to match the requested output language
- Recall ping filtering no longer depends on the English title wording alone

## Remaining Work From The Original Two-Week Plan

Status: not done yet

1. Real usage pass
   Use the app with a larger batch of real captures and inspect where the cards still become vague or annoying.

2. Prompt and threshold tuning
   The chaos-reset prompt, digest prompt, and recall thresholds should be tuned against real captures instead of only synthetic probes.

3. Morning brief refresh
   The overnight report still describes an earlier system shape and should be updated to mention chaos reset, modes, budget, and recall filtering.

4. Docs cleanup
   README and supporting docs should reflect the current product shape rather than the Day 1-3 skeleton only.

## Current Product Shape

The narrowest honest description now is:

> Forward drift into Telegram, or hit "I'm drifting" locally. driftpet compresses it into one next move and shows only the memories worth resurfacing.
