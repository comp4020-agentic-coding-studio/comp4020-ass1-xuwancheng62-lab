# Process overview

## What I built

A sorting race. Pick two algorithms, press **Race**, and watch the bars move
while the comparison counters climb. One race is one array and a lucky array
flatters an algorithm, so a statistics table runs twenty arrays of each of three
starting shapes; four finding cards say what that table showed; and each card
opens an improvement that races a proposed fix against its own original on
identical arrays. Everything on the page is comparisons — not time, not memory,
and not a claim about longer arrays. The idea is that the cost is the thing
worth seeing, and the animation is the explanation rather than a decoration on
top of one.

## The moments that mattered

**Merge sort was animating arrays that never existed.** Six screenshots across
both viewports looked right and I nearly accepted the feature. The obvious move
was another prompt. Instead the finding went into `CLAUDE.md` as a standing rule
— if the thing you built is a process, check it over time, not in stills
([`babece7`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-xuwancheng62-lab/commit/babece7))
— and became a spec test asserting every frame is a permutation of the input.
That test was committed **deliberately red**
([`a6cfe79`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-xuwancheng62-lab/commit/a6cfe79)),
so the history shows the bug being demonstrated before it was fixed
([`a6cfe79...6cfc01a`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-xuwancheng62-lab/compare/a6cfe79...6cfc01a)).
Committing red broke my own rule, so that rule got a written, narrow carve-out
rather than a quiet exception
([`2b19c9e`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-xuwancheng62-lab/commit/2b19c9e)).

**A number that was true and still lied.** On nearly-sorted input our bubble
sort showed a flat 120.0 beside insertion's 24.8. Both figures are exact. The
reading a visitor reaches — "bubble sort can't exploit order" — is false; ours
simply has no early exit. Every check stayed green either way, because nothing
tests what a reader concludes. A footnote would have been the cheap fix. The
rule instead is that a variant-dependent measurement carries its variant next to
the number, in the row or beside the control
([`1422111`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-xuwancheng62-lab/commit/1422111)).

**A check that asked the wrong question.** At 390px the improvement table drew
outside its card. I had measured horizontal overflow, seen zero, and dismissed
the screenshot — the page padding was absorbing the spill, so the *document*
was fine while the *card* was not. The fix was not only the CSS: the check now
asserts every element stays inside its own surface, and the table gets a scroll
floor underneath the fit
([`7075560`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-xuwancheng62-lab/commit/7075560)).

**Learning where permission is actually needed.** Given an icon, I sized and
cropped it autonomously but stopped before putting its colours on the page. That
split turned out to be the right one and is now written down: preparing an image
is implementation, lifting a palette out of it is a planning decision
([`e5d6d7a`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-xuwancheng62-lab/commit/e5d6d7a)).
The colours shipped darkened, because the icon's amber measures 1.92:1 against
the page and large text needs 3:1
([`cfc89ce`](https://github.com/comp4020-agentic-coding-studio/comp4020-ass1-xuwancheng62-lab/commit/cfc89ce)).

## Where to look

`PLAN.md` carries the frozen plan and ten amendments; every `plan:` commit
precedes the feature commit it authorises, which is the shape of the whole
history.
