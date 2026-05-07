# Remaining Execution Order

This is the remaining part of the original two-week V1 plan, in execution order.

## Next

1. Broader real usage pass
   Feed more real Telegram / local chaos inputs and inspect where cards still become vague, repetitive, or annoying now that chaos-reset duplication and mixed-language fields are fixed.

2. Prompt and threshold retuning
   Adjust the chaos-reset wording, digest prompt, and recall thresholds against the real cards now in SQLite instead of synthetic-only probes.

3. Telegram URL batch pass
   Run a broader set of real Telegram URL captures and verify extraction state, fallback honesty, and downstream digest quality from the actual poller path.

## Recently closed

4. Report refresh
   Done for the current product shape. Keep rerunning it after major behavior changes so the generated morning brief stays honest.

5. README cleanup
   Done. Setup, current behavior, and operational notes now match the current app behavior.

6. URL extraction live pass
   Done. Public-page extraction was rechecked with the current code. In the Codex sandbox it falls back to `fetch_failed`, but the same Electron-as-Node probe outside the sandbox reached `readability` on live MDN and `example.com`, so the current remaining gap is product-level Telegram batch observation rather than core extraction logic.
