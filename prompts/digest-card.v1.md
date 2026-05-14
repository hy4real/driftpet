# Thread Cache Prompt V1

You are generating a compact working-memory cache for a personal desk pet.

The pet is guarding an unfinished work thread, not archiving a note. Preserve the unstable middle state that the user may lose when attention breaks.

Return JSON only. No prose outside JSON.

Required schema:
{
  "title": "short concrete label for the work thread, max 120 chars",
  "useFor": "1-2 concrete sentences about how to resume this thread next",
  "knowledgeTag": "one short knowledge label or phrase",
  "summaryForRetrieval": "a retrieval-friendly working-memory summary that preserves the question being chased, temporary judgment, ruled-out path, next action, and concrete entities when present — 2-4 sentences, detailed enough that two cards about the same live thread will score high in semantic search"
}

Rules:
- Do not write a generic summary.
- Treat the card as a thread cache, not as an article digest or task-list item.
- Preserve unfinished working memory: the current question, tentative judgment, ruled-out path, next move, and deferred side branch whenever the source provides them.
- Match the requested output language.
- Do not mix Chinese and English inside the same field unless the source text itself requires a literal term.
- `useFor` must produce a next move, not a content recap.
- `useFor` must name a physical or editor action the user can start now: close, write, inspect, compare, paste, run, commit, send, or choose.
- `useFor` must not say only “review”, “read”, “summarize”, “analyze”, “improve”, “optimize”, “continue”, “look into”, `继续优化`, `分析一下`, `看一下`, or `整理一下` unless it also names the exact object and first action.
- Use the recent cards context to avoid vague suggestions and to keep continuity with the same guarded thread.
- `knowledgeTag` should be short and reusable.
- `summaryForRetrieval` must include the project or domain name, the concrete action or decision, any tool/file/entity names, and any temporary judgment or ruled-out path from the source. Do not write a generic phrase — make it specific enough that semantic search can distinguish this thread from nearby work.
- If the input is a successfully extracted URL/article, treat it as just-in-time reference, not something the user should fully consume right now.
- For successfully extracted URL/article inputs, `useFor` should tell the user what single fact, step, or example to pull from the page for the current task, then move on.
- For successfully extracted URL/article inputs, avoid phrasing that sounds like “summarize / read / review / learn this whole article”.
- For direct high-signal text inputs, treat them as current-work self-instructions rather than generic notes.
- For direct high-signal text inputs, `knowledgeTag` must name the real work thread and must not fall back to generic labels like `captured note` or `捕获笔记`.
- If the text says the user is drifting, spiraling, lost in tabs, or losing the thread, make `useFor` a guard-and-return action: close or ignore the distracting branch, name the one thread the pet should guard, and do the first five-minute move.
