# driftpet Phase 1 Spec

## Context

This spec exists because the app's product identity drifted before implementation boundaries were frozen.

The weak framing turned driftpet into an anti-drift reminder tool:

- it assumes the user notices they are drifting,
- it assumes they will stop and type into it,
- it assumes the pain is "not knowing the next step,"
- and it competes with actions the user can already do inside their own head.

That framing does not justify the product.

## Problem

driftpet was pushed toward a "help me get back on track" utility before its real value was specified.

That created two failures:

1. the product promise became unrealistic
2. implementation energy went into the wrong surface area

The first Phase 1 requirement is to freeze a better product direction before more feature work continues.

## Product Intent

driftpet should be closer to a desktop pet than a focus reminder.

The product should feel like:

- a small living presence on the desktop
- visually expressive through basic motion and expression
- easy to reposition and keep nearby
- able to accept a Telegram link and hand it off into a local Obsidian ingest workflow

The product should not depend on the user noticing a "drift warning" at the exact moment they are already distracted.

## Core Promise For Phase 1

Phase 1 only commits to two things:

1. desktop-pet presence
2. Telegram link handoff into the local Obsidian vault ingest path

Everything else is deferred unless added by a later spec revision.

## In Scope

### 1. Desktop-pet presence

After startup, the pet should:

- exist as a visible desktop pet surface
- show basic motion or expression such as blinking
- react when the cursor touches it
- be draggable to arbitrary positions
- visually move in the drag direction in a way that feels like running rather than inert repositioning

### 2. Telegram link handoff

When the user drops a link into Telegram for the app, the app should:

- receive the link
- hand it off into the local vault workflow under `/Users/mac/my-obsidian-vault`
- start Claude from that directory
- trigger ingest from there

Phase 1 cares about the end-to-end handoff path existing and feeling reliable.

## Out Of Scope

Phase 1 does not promise:

- click-to-chat as a core product surface
- general-purpose memory assistant behavior
- a full "anti-drift" recovery workflow
- broad proactive productivity guidance
- solving the user's focus problem directly
- replacing the user's own thinking loop
- expanding into a general companion app

## User-Visible Acceptance

Phase 1 is correct when the user can say all of the following are true:

1. After startup, the pet has basic actions and expressions such as blinking.
2. When the cursor touches the pet, it reacts with a new action.
3. The pet can be dragged anywhere on screen.
4. During drag, the pet's movement feels direction-aware rather than static.
5. When a link is sent through Telegram, driftpet routes that link into `/Users/mac/my-obsidian-vault`.
6. The local handoff starts Claude in that directory and runs ingest from there.

## Constraints

- Phase 1 is a spec-first effort; this document freezes intent before implementation planning.
- The first delivery after this step is workflow plus `spec.md`, not product implementation.
- Existing `.omx/` state and `workflow-fusion/` protocol surfaces remain in place; this spec does not replace them.
- Scope must stay narrow enough that later `plan.md` and `tasks.md` can remain concrete.

## Evidence Behind This Spec

The concrete failure example is the current app direction itself:

- the application was shaped as something that helps a user drift back by noticing distraction and typing in the next step
- the user considers that unrealistic and weak
- therefore the first SDD packet must correct positioning before more code pushes the wrong identity further

## Non-Goals For This Spec Packet

This document does not yet define:

- the exact animation system
- renderer/main-process architecture changes
- the Telegram-to-Claude orchestration mechanism
- failure handling and retries for ingest
- the detailed implementation sequence

Those belong in `plan.md`, not here.

## Open Questions

1. What exact desktop interaction model is best for the draggable pet surface in the current Electron architecture?
2. How should the Telegram link handoff invoke Claude safely and deterministically from the vault directory?
3. What minimum verification proves the handoff worked beyond process launch?
4. What existing surfaces from the current app should be reused versus retired in the repositioned product?
