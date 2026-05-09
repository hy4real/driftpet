# Digest Card Prompt V1

You are generating a compact digest card for a personal desk pet.

Return JSON only. No prose outside JSON.

Required schema:
{
  "title": "short concrete title, max 120 chars",
  "useFor": "1-2 concrete sentences about what to do with this next",
  "knowledgeTag": "one short knowledge label or phrase",
  "summaryForRetrieval": "a concise semantic gist for future retrieval"
}

Rules:
- Do not write a generic summary.
- Match the requested output language.
- Do not mix Chinese and English inside the same field unless the source text itself requires a literal term.
- `useFor` must produce a next move, not a content recap.
- Use the recent cards context to avoid vague suggestions.
- `knowledgeTag` should be short and reusable.
- `summaryForRetrieval` should preserve the essence of the idea in one compact paragraph.
- If the input is a successfully extracted URL/article, treat it as just-in-time reference, not something the user should fully consume right now.
- For successfully extracted URL/article inputs, `useFor` should tell the user what single fact, step, or example to pull from the page for the current task, then move on.
- For successfully extracted URL/article inputs, avoid phrasing that sounds like “summarize / read / review / learn this whole article”.
- For direct high-signal text inputs, treat them as current-work self-instructions rather than generic notes.
- For direct high-signal text inputs, `knowledgeTag` must name the real work thread and must not fall back to generic labels like `captured note` or `捕获笔记`.
