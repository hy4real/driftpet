# driftpet Product Direction

## Decision

driftpet is a desktop pet that guards working memory.

It is not an AI notes app with a pet skin. It is also not a cute desktop pet that happens to summarize things. The pet is the interaction form for an otherwise fragile thing: the unfinished, not-yet-written working state that disappears when attention breaks.

The product sentence is:

> A desktop pet that guards the working memory thread you have not written down yet.

## The Narrow Job

driftpet should preserve the part of work that existing tools usually miss:

- the question currently being chased,
- the temporary judgment forming in the user's head,
- the path just ruled out,
- the first next move after returning,
- the useful side lead that should not take over yet,
- the point at which the thread is cold enough to drop.

Task lists already know what the user owes. Open apps already show the work surface. Documents hold stable conclusions. driftpet owns the unstable middle state before it becomes any of those things.

## Product Principle

Every pet behavior should carry memory state.

- Dragging or pasting into the app means handing the pet a thread to guard.
- Idle motion means the pet is waiting, guarding, or has no thread.
- A gentle reminder means the guarded thread is getting cold, not that the user should be more productive.
- Clicking the pet means returning to the guarded thread.
- Sleep means there is no useful thread to guard, or the user has asked for quiet.
- History means lines that have been put down, not a generic archive.

Pet behavior that does not clarify, protect, cool down, resume, or release a working-memory thread is secondary.

## What This Rules Out

- Do not compete with task managers for commitments.
- Do not compete with Obsidian or documents for stable knowledge.
- Do not compete with chat apps for open-ended conversation.
- Do not add more pet performance that is detached from the guarded thread.
- Do not broaden capture surfaces before the current thread loop is strong.
- Do not force weak related memories just to make the app feel smart.

## Near-Term Build Direction

The next product phase should converge on a `thread cache` loop:

1. The user gives the pet a messy unfinished thought, link, or working note.
2. The pet turns it into a compact working-memory cache.
3. The pet visibly guards that current cache on the desktop.
4. Returning to the pet shows the next move first.
5. The user can continue, put the thread down, or settle it into a note.

The cache shape should bias toward:

- `chasing`: the current problem or line of inquiry,
- `working_judgment`: the tentative conclusion or suspicion,
- `ruled_out`: paths not to retry without new evidence,
- `next_move`: the smallest useful action on return,
- `side_thread`: useful but deferred material,
- `expires_when`: when the cache should stop asking for attention.

## Validation Standard

The product is working only when the user returns after an interruption and sees something that task lists, open windows, and ordinary notes did not preserve.

The acceptance question is:

> Does this remind me of the exact working-memory state I would otherwise have lost?

If the answer is merely "it summarized the input," driftpet is not sharp enough.

If the answer is "yes, that is the thought I was about to lose," the pet has earned its place on the desktop.
