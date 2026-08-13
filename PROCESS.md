# Process overview

## What I built

A sorting race. Pick two algorithms, press **Race**, and watch the bars move
while the comparison counters climb. A statistics table then runs twenty arrays
of each of three starting shapes; four finding cards say what it showed; and
each card opens an improvement that races a fix against its own original.
Everything measured is comparisons — not time, not memory.

## One race was not enough

My original idea focused on the race animation. But one race measures one array,
so a lucky input can make an algorithm look better than it is. Instead of
presenting the winner of one animation as evidence, I added statistics over
twenty arrays for each input shape
([`a316a3f`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-xuwancheng62-lab/commit/a316a3f)),
then laid the three shapes side by side so shape became a condition of the
experiment rather than a setting
([`f85aabe`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-xuwancheng62-lab/commit/f85aabe)).
The identical twenty arrays go to all four algorithms, which is what makes the
rows comparable.

The repeated results showed insertion sort varying dramatically with shape,
merge sort staying stable, and our quick sort turning much worse on nearly
ordered inputs — patterns invisible in any single race, and the evidence the
rest of the site is built on rather than an extra feature.

## Merge sort was animating arrays that never existed

Six screenshots across both viewports looked right and I nearly accepted the
feature. The obvious move was to prompt again until the animation looked
correct. Instead the finding went into `CLAUDE.md` as a standing rule — if the
thing you built is a process, check it over time, not in stills
([`babece7`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-xuwancheng62-lab/commit/babece7))
— and became a spec test asserting that every frame is a permutation of the
input
([`a6cfe79`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-xuwancheng62-lab/commit/a6cfe79)).
I committed that test **deliberately red**, so the history shows the bug
demonstrated before it was fixed
([`a6cfe79...6cfc01a`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-xuwancheng62-lab/compare/a6cfe79...6cfc01a)).
Committing a red check broke my own rule, so that rule got a written, narrow
carve-out rather than a quiet exception
([`2b19c9e`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-xuwancheng62-lab/commit/2b19c9e)).

## The implementation was part of the result

One result looked particularly interesting: our bubble sort made exactly 120
comparisons on every input shape. It would have been easy to call that a
property of bubble sort. Instead I questioned the number and found our
implementation runs fixed loops with no early exit, so sixteen items always cost
120. Quick sort had a similar story: taking the last element as the pivot is why
nearly ordered inputs did so badly.

Every figure was exact and every check stayed green, because nothing tests what
a reader concludes. A footnote would have been the cheap fix. The rule I added
instead is that a variant-dependent measurement carries its variant next to the
number
([`1422111`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-xuwancheng62-lab/commit/1422111)).
I also added original-versus-improved races — early-exit bubble, random-pivot
quick — so an implementation limit is something a visitor can test rather than
trust
([`c4985f4`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-xuwancheng62-lab/commit/c4985f4)).

## Repeated friction became a harness rule

Given a 1254×1254, 1.1 MB PNG for the site icon, the agent cropped and resized
it without asking and reported the numbers — but stopped before putting the
icon's colours on the page. That split was right, so rather than re-decide it
with the next asset I wrote it down: images I hand it are its to prepare
([`e5d6d7a`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-xuwancheng62-lab/commit/e5d6d7a)).
Two carve-outs stayed outside it deliberately: lifting a palette out of an image
changes the visual system and goes through my planning trigger, and my original
file stays until I say otherwise. The colours that shipped were darkened first,
because the icon's amber measures 1.92:1 against the page and large text needs
3:1
([`cfc89ce`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-xuwancheng62-lab/commit/cfc89ce)).

## Where to look

`PLAN.md` carries the frozen plan and its dated amendments; every `plan:` commit
precedes the feature commit it authorises.
