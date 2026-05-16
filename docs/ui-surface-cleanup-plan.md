## UI Surface Cleanup Plan

Goal: replace scattered renderer booleans with one canonical surface state so mini, compact, and expanded transitions stay consistent.

Behavior to preserve:
- `mini` remembered-thread entry opens the compact full card.
- Compact full card closes into the compact remembered-thread summary.
- Releasing the remembered thread from compact returns to mini without deleting the card.
- Expanded workbench remains pet-free and can resume the remembered thread into compact.

Steps:
1. Add a pure renderer surface resolver for the approved UI states.
2. Route `App.tsx` window transitions through explicit helpers instead of ad hoc `setWindowSize(...)` calls.
3. Simplify `PetShell.tsx` to render from the resolved surface instead of inferring multiple overlapping branches.
4. Extend smoke coverage around surface transitions and escape behavior.
5. Run typecheck, smoke tests, window-state tests, and build.
