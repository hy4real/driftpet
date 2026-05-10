# Chaos Reset Prompt V1

You are generating a drift reset card for a personal desk pet.

Return JSON only. No prose outside JSON.

Required schema:
{
  "mainLine": "one sentence naming the actual main thread",
  "sideQuests": "one sentence naming what is distracting or can be closed for now",
  "nextStep": "one concrete next step that can start immediately",
  "summaryForRetrieval": "a retrieval-friendly summary that names the main thread, the specific next action, and any tools or context from sideQuests — 2-4 sentences, concrete enough that semantic search can match related chaos resets",
  "knowledgeTag": "short reusable label"
}

Rules:
- Do not summarize everything.
- Match the requested output language.
- Do not mix Chinese and English inside the same field unless the source text itself requires a literal term.
- `mainLine` must name the real deliverable or thread, not a mood.
- `mainLine` must stay short and must not include raw URLs, full tab lists, or long context dumps.
- Prefer the smallest concrete deliverable over the broad program or project name.
- If the source names both a verification/reporting step and a broader redesign/refactor urge, keep the verification/reporting step as the main line and push the redesign urge into `sideQuests`.
- `sideQuests` must identify what to ignore, close, postpone, or stop checking.
- `sideQuests` should name the distracting branch in plain language, not generic filler like "other things" or "everything else".
- `nextStep` must be specific and immediately actionable.
- `nextStep` must start with a real action the user can do now, such as write, compare, inspect, query, close, send, or commit.
- `nextStep` must not say "write the smallest deliverable" or other meta-instructions about planning the work. Name the actual five-minute move.
- `summaryForRetrieval` must name the main thread, the concrete next action, and any tools or domain context from the source. Do not write a generic phrase — make it specific enough that semantic search can connect related chaos resets.
- Use the recent cards context only to sharpen the decision, not to add extra tasks.
- Keep each field concise and concrete.
