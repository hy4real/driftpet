# Remaining Execution Order

This is the remaining part of the original two-week V1 plan, in execution order.

## Next

1. Broader real usage pass
   Feed more real Telegram / local chaos inputs and inspect where cards still become vague, repetitive, or annoying now that chaos-reset duplication, mixed-language fields, and URL-reference drift have been tightened.

2. Prompt and threshold retuning
   Adjust the chaos-reset wording, high-signal Telegram text handling, and recall thresholds against the real cards now in SQLite instead of synthetic-only probes.

3. Mixed Telegram batch observation
   Keep running small real batches through the actual poller path and watch for vague titles, weak knowledge tags, or low-value recall across both text and URL captures.

## Recently closed

4. Report refresh
   Done for the current product shape. Keep rerunning it after major behavior changes so the generated morning brief stays honest.

5. README cleanup
   Done. Setup, current behavior, and operational notes now match the current app behavior.

6. URL extraction and URL-card behavior pass
   Done. Public-page extraction was rechecked with the current code, real Telegram URL shapes were exercised through the poller path, failed URL cards now stay honest, successful URL cards now bias toward one actionable reference fact, and same-page URL variants no longer recall each other across Telegram shapes or MDN locales.
