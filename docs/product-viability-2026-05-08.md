# driftpet Product Viability Check

## Current Judgment

In its current shape, driftpet still feels optional.

The problem is not that the pet lacks polish. The problem is that the product still has not earned a strong enough reason to exist outside the user's own head.

The current experience is coherent, but not yet necessary.

## Why It Feels Weak

### 1. The trigger happens too late

Right now the user must already know they are drifting in order to use the app well.

Current capture paths are:

- forward text or a URL into Telegram
- paste a local chaos dump into the workbench

Both happen after the user has already noticed the problem.

That means driftpet is not yet "catching drift." It is mostly helping after the user has manually declared drift.

This weakens the whole product:

- if the user already knows they are lost, they may recover alone,
- if they do not know they are lost, driftpet does not meaningfully intervene,
- so the app sits in a middle zone: helpful sometimes, but rarely indispensable.

### 2. The output is useful, but not hard to replace

The current value is:

- compressing messy input into one next move
- recalling one or two relevant older cards

That is directionally right, but still too close to "small summarizer with memory."

If the output can be replaced by:

- a quick note to self,
- five seconds of self-talk,
- or a normal chat prompt,

then the pet has not yet earned dedicated presence on the desktop.

### 3. The pet's aliveness is still mostly representational

The renderer now has:

- idle stance copy,
- mood labels,
- breathing / glance animation,
- lightweight remembered-thread presence

This improves tone, but it does not yet create a stronger utility loop.

The pet currently feels more alive in presentation than in consequence.

That is the exact place where a desktop pet can become "cute but optional."

### 4. The cost of using it is still non-trivial

Even the lightest path still asks the user to:

- notice drift,
- open or touch the pet,
- dump context,
- wait for a card,
- decide whether the card is genuinely better than just resuming work.

For a product that lives on the desktop, that is a high bar.

The tool does not need to be zero-friction, but it must beat "just think for ten seconds" often enough to become a habit.

That proof does not exist yet.

## What Is Actually Working

The current system is not random. It already has a coherent shape:

- chaos-reset is better than a generic prompt box
- recall is more restrained than before
- language-following behavior is grounded
- the pet no longer behaves like a loud reminder toy

So the issue is not "bad execution."

The issue is sharper:

> the core value loop is plausible, but still underpowered relative to the effort of invoking it.

## The Real Product Risk

The biggest risk is not poor UX.

The biggest risk is building a product that is emotionally charming but operationally unnecessary.

That failure mode looks like this:

- the user agrees with the concept,
- likes the pet,
- occasionally gets a decent card,
- but does not naturally reach for it at the moment of drift.

If that happens, all future polish compounds on top of a weak loop.

## What Must Become True

For driftpet to justify itself, at least one of these must become strongly true:

### Option A — Better than internal recovery

When the user is tangled, dumping into driftpet must beat solo mental recovery often enough that using it becomes automatic.

This means:

- faster capture,
- more specific next moves,
- less generic card language,
- clearer re-entry value.

### Option B — Better timing than the user alone

driftpet must catch or surface the thread at a moment the user would otherwise miss.

This does **not** require full passive surveillance, but it does require better timing than "user manually decides to ask for help."

Without better timing, the app remains reactive in a weak way.

### Option C — Better continuity than ordinary notes

driftpet must preserve return-to-thread continuity in a way that ordinary notes, chat logs, and mental bookmarks do not.

If it becomes the best place to resume interrupted work, that alone could justify the pet.

But this has to feel materially better, not merely more atmospheric.

## What Should Not Happen Next

To avoid digging deeper into a weak loop:

- do not add more cosmetic aliveness first
- do not add broader chat capability
- do not add more capture surfaces unless they improve timing or friction
- do not confuse "pleasant vibe" with "earned utility"

## Recommended Next Decision

The next product step should not be "what feature do we add?"

It should be:

> Which single justification is driftpet trying to win first: recovery, timing, or continuity?

Only one should lead the next build phase.

## My Assessment

Right now the strongest candidate is **continuity**.

Why:

- it fits the current architecture,
- it avoids fake intelligence,
- it preserves the companion metaphor,
- and it gives the pet a clearer job than generic reminder or summarizer.

That would mean pushing driftpet toward:

- being the best place to re-enter a broken thread,
- remembering the last real line of work,
- and returning you to it with less friction and less noise than your own scattered notes.

If driftpet cannot become clearly excellent at that, then the user's "鸡肋" judgment is probably correct.
