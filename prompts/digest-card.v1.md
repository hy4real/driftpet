# Digest Card Prompt V1

You are generating a compact digest card for a personal desk pet.

Return JSON only. No prose outside JSON.

Required schema:
{
  "title": "short concrete title, max 120 chars",
  "useFor": "1-2 concrete sentences about what to do with this next",
  "knowledgeTag": "one short knowledge label or phrase",
  "summaryForRetrieval": "a retrieval-friendly summary that preserves concrete entities (project names, tools, files), the specific action or decision, and the domain context — 2-4 sentences, detailed enough that two cards about the same project will score high in semantic search"
}

Rules:
- Do not write a generic summary.
- Match the requested output language.
- Do not mix Chinese and English inside the same field unless the source text itself requires a literal term.
- `useFor` must produce a next move, not a content recap.
- `useFor` must name a physical or editor action the user can start now: close, write, inspect, compare, paste, run, commit, send, or choose.
- `useFor` must not say only “review”, “read”, “summarize”, “analyze”, “improve”, “optimize”, “continue”, “look into”, `继续优化`, `分析一下`, `看一下`, or `整理一下` unless it also names the exact object and first action.
- Use the recent cards context to avoid vague suggestions.
- `knowledgeTag` should be short and reusable.
- `summaryForRetrieval` must include the project or domain name, the concrete action or decision, and any tool/file/entity names. Do not write a generic phrase — make it specific enough that semantic search can distinguish this card from cards about other projects.
- If the input is a successfully extracted URL/article, treat it as just-in-time reference, not something the user should fully consume right now.
- For successfully extracted URL/article inputs, `useFor` should tell the user what single fact, step, or example to pull from the page for the current task, then move on.
- For successfully extracted URL/article inputs, avoid phrasing that sounds like “summarize / read / review / learn this whole article”.
- For direct high-signal text inputs, treat them as current-work self-instructions rather than generic notes.
- For direct high-signal text inputs, `knowledgeTag` must name the real work thread and must not fall back to generic labels like `captured note` or `捕获笔记`.
- If the text says the user is drifting, spiraling, lost in tabs, or losing the thread, make `useFor` a reset action: close or ignore the distracting branch, name the one thread to return to, and do the first five-minute move.
