# Resume Thread / Claude Dispatch Manual Verification

Use this after changes to remembered-thread resume, Claude Code dispatch, clipboard staging, or the pet settings panel. Automated tests cover renderer state and IPC contracts; this checklist covers real macOS windowing and terminal automation.

## Preconditions

- Run `npm run dev`.
- Ensure the app has at least one real card in history.
- If testing dispatch, set Claude Code settings in the app:
  - Terminal: `Ghostty`, `Terminal`, or `iTerm`.
  - Working directory: absolute path to the target repo.
  - Mode: `连续模式` for remembered-thread context, `独立卡片` for current-card-only context.

## Checks

1. Mini resume
   - Start in mini mode with no active card.
   - Confirm the mini bubble shows `上次那条线`.
   - Click it.
   - Expected: compact mode opens directly on the remembered card, without opening the history drawer.

2. Clipboard staging
   - Copy a short paragraph while driftpet is in mini mode.
   - Open the nest.
   - Expected: clipboard content appears as a strip at the top of the workbench.
   - Click `收进输入框`.
   - Expected: textarea is filled and the window does not collapse back to mini.

3. Claude dispatch success
   - Open history.
   - Click `派给 Claude Code` on a card.
   - Expected: configured terminal opens a Claude Code session in the configured working directory.
   - Expected: the card shows `单卡已派发` after dispatch returns.
   - Click `标记完成`.
   - Expected: the card changes to `单卡已完成` and no longer shows close-loop action buttons.

4. Claude dispatch failure
   - Set an invalid terminal app or invalid Claude binary environment.
   - Dispatch a card.
   - Expected: driftpet shows a failure note and the history card records a failed dispatch state.

5. Continuity mode
   - Set `连续模式`.
   - Open the nest and confirm a `线头模式` panel appears when remembered-thread data exists.
   - Click `派给 Claude Code（整条线）`.
   - Expected: generated prompt includes both `Dispatch mode` and `Active thread bundle`.
   - Expected: generated prompt includes a `Remembered thread` section when one exists.
   - Expected: the workbench thread panel shows `整条线已派发` with `标记完成` and `收起记录`.
   - Click `收起记录`.
   - Expected: the thread dispatch note disappears without deleting the card or dispatch prompt file.
   - Set `独立卡片`.
   - Dispatch another card.
   - Expected: generated prompt excludes the remembered-thread section and the workbench no longer shows a fake thread bundle.

6. Card deletion
   - Delete a non-critical test card from history.
   - Expected: it disappears from history and no longer appears as the active or pending card.

## Verification Commands

```bash
npm run typecheck
npm run test:ui-smoke
npm run test:claude-dispatch
npm run test:claude-settings
npm run test:recall
npm run test:digest-card
npm run test:window-state
node --test --experimental-strip-types src/shared/thread-bundle.test.mjs
```

## Known Gaps

- This checklist does not prove Claude completes the task or writes a result back to driftpet.
- `标记完成` is a local manual state; driftpet does not yet read Claude Code completion automatically.
- Terminal automation can fail for local macOS permission reasons even when the app code is correct.
