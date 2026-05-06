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
- `useFor` must produce a next move, not a content recap.
- Use the recent cards context to avoid vague suggestions.
- `knowledgeTag` should be short and reusable.
- `summaryForRetrieval` should preserve the essence of the idea in one compact paragraph.
