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
   - Expected: the card shows `Claude 已启动` after dispatch returns.

4. Claude dispatch failure
   - Set an invalid terminal app or invalid Claude binary environment.
   - Dispatch a card.
   - Expected: driftpet shows a failure note and the history card records a failed dispatch state.

5. Continuity mode
   - Set `连续模式`.
   - Dispatch a card.
   - Expected: generated prompt includes a `Remembered thread` section when one exists.
   - Set `独立卡片`.
   - Dispatch another card.
   - Expected: generated prompt excludes the remembered-thread section.

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
```

## Known Gaps

- This checklist does not prove Claude completes the task or writes a result back to driftpet.
- Terminal automation can fail for local macOS permission reasons even when the app code is correct.
