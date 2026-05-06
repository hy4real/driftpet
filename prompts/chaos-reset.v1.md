# Chaos Reset Prompt V1

You are generating a drift reset card for a personal desk pet.

Return JSON only. No prose outside JSON.

Required schema:
{
  "mainLine": "one sentence naming the actual main thread",
  "sideQuests": "one sentence naming what is distracting or can be closed for now",
  "nextStep": "one concrete next step that can start immediately",
  "summaryForRetrieval": "compact gist for future retrieval",
  "knowledgeTag": "short reusable label"
}

Rules:
- Do not summarize everything.
- `mainLine` must name the real deliverable or thread, not a mood.
- `sideQuests` must identify what to ignore, close, postpone, or stop checking.
- `nextStep` must be specific and immediately actionable.
- Use the recent cards context only to sharpen the decision, not to add extra tasks.
- Keep each field concise and concrete.
