# PLAN: sorting algorithm explainer

## The problem

The brief asks for one strong idea with a point of view, one dataset or
mechanic, and nothing else — a static, client-side, interactive explainer,
deployed by **12:00, Monday 17 August 2026** (5 days out from today,
12 August).

The starting idea is sound: sorting algorithms are a classic "same problem,
different strategies" subject, and the genre (Elevators, Mechanical Watch) is
exactly the one that rewards a live, manipulable simulation over a static
diagram. The risk isn't the topic — it's scope. Five algorithms rendered as a
gallery ("pick one from a dropdown, watch it go, repeat") reads as a checklist
of implementations rather than one idea with a point of view, and the brief
marks that down under "response to the brief" (P band: "an answer without a
point of view").

**Point of view — confirmed:** *"same input, same problem, wildly different
amounts of work" is not an abstraction — you can watch the cost happen.* The
single mechanic that carries this is a **race**: two algorithms run against
the identical shuffled array at the same time, side by side, each with a live
step counter. The visitor doesn't inspect algorithms one at a time — they
watch one visibly win. Confirmed as the core mechanic for the MVP.

## MVP algorithm set — confirmed: Bubble, Merge, Quick

One naive strategy plus two divide-and-conquer strategies that share a
complexity class but diverge in behaviour and worst case — the tightest set
that still carries the point of view without repeating itself.

| Algorithm | Strategy | Why it earns a place |
| --- | --- | --- |
| Bubble Sort | naive, adjacent swaps | The baseline "slow and obvious" — legible frame-by-frame, easy to predict wrong |
| Merge Sort | divide-and-conquer, recursive split/merge | O(n log n), but the *motion* looks nothing like Quick Sort despite the same complexity class — that gap is itself a point |
| Quick Sort | divide-and-conquer, in-place partition | Same big-O as Merge on average, but degrades on adversarial input (already-sorted/reverse-sorted) depending on pivot choice — a second, subtler "same problem, different cost" story |

Scope stays here for now — getting the race mechanic right on three
algorithms, rather than widening the set, per the decision below.

## Proposed first version (MVP)

- One page. An array of vertical bars (height = value) rendered **twice**,
  side by side — Panel A and Panel B — sharing one underlying shuffled array
  each time it's generated.
- Controls: an algorithm selector for each panel (Bubble / Merge / Quick), a
  "New shuffle" button, and a "Race" button that starts both panels
  simultaneously against the same array.
- Each panel shows a live comparison counter while running, and freezes with a
  "finished in N comparisons" label when that panel's array is fully sorted.
  The panel that finishes first is visually marked (e.g. a border highlight).
- **What the visitor does:** picks two algorithms, presses Race, and watches
  which one gets to a sorted array first and in fewer comparisons — repeatable
  with a reshuffle to try a different pairing.
- **What they should understand afterwards:** that "sorting" isn't one thing —
  different strategies visibly do different amounts of work on the exact same
  input, and the gap is sometimes large even between algorithms with the same
  textbook complexity class (Merge vs Quick).

This is deliberately smaller than "visualise five algorithms." It's one
mechanic (the race), one dataset (one shuffled array per run), and the point
of view is built into the interaction itself rather than asserted in prose.

## Design decisions forced by the spec

- **Both viewports.** Two side-by-side bar panels at 390×844 is the real
  constraint: a naive two-column layout will squeeze each panel to ~180px
  wide, and a bar count that reads fine on desktop may be illegible at that
  width. Default array size needs to be small enough to stay legible at
  390px (proposing **16 elements**) and the two panels need to stack
  vertically on narrow viewports rather than staying side-by-side — a layout
  decision, not just a CSS tweak, so flagging it here rather than deciding it
  silently.
- **No server, nothing async beyond animation timing.** The whole thing is
  arrays, timers, and DOM/canvas updates — comfortably static and client-side,
  satisfying that spec line without extra effort.
- **The core interaction is the testable line.** The concrete contract I'll
  write a spec test against, once this plan is approved: *triggering Race
  causes each panel's bar heights to end in non-decreasing order, and each
  panel's comparison counter is non-zero and stops changing once that panel is
  sorted.* That test starts red (nothing is built yet) and I won't write it
  until this plan is signed off, per the standing rule not to code ahead of an
  approved plan.

## Deferred ideas — not in scope now, revisit after the MVP works

Keeping these here rather than dropping them, so they get a real second look
once there's a working first version to evaluate against, rather than being
decided now on speculation.

- **Insertion Sort.** Redundant as a fourth O(n²) example next to Bubble
  unless it's given its own hook — it's adaptive, fast on nearly-sorted input,
  which none of Bubble/Merge/Quick specially exploit. Worth adding only
  alongside a "start from a nearly-sorted array" toggle, which is more scope
  than the MVP needs. Revisit once the race mechanic is solid.
- **Bogo Sort.** Fits the "same problem, wildly different approach" thesis
  well (factorial expected time is a genuinely different order of magnitude,
  and it's funny — matches the "intentionally absurd contrast" instinct from
  the brief's own exemplars). But it's technically problematic as written: a
  literal implementation blocks the main thread in a tight loop, and above
  ~6–7 elements the expected running time isn't "slow," it's "will not finish
  in a marking session." If revisited, it needs a hard cap (n ≤ 5), shuffle
  attempts yielded via `setTimeout`/`requestAnimationFrame` rather than a
  synchronous loop, and a visible attempt counter so a slow run reads as
  "working as designed" rather than "hung." Cut entirely rather than shipped
  flaky if it can't be made to reliably finish in a few seconds.

## Decisions — confirmed, plan frozen

1. **Framing/angle.** "Watch the cost happen" — the page leads with the race
   itself, minimal exposition; the interaction is the argument, not a
   complexity-theory lecture.
2. **Counter metric.** Comparisons only. Simplest, least busy on a 390px
   panel.
3. **Manual stepping.** Continuous play only for V1. Press Race, both panels
   animate to completion.
4. **Default array size.** 16 elements per panel, freshly randomised on load
   and on "New shuffle." Both panels always share the exact same shuffle.

This plan is now frozen. Implementation proceeds against it; any departure
gets flagged here rather than the plan being quietly edited to match what got
built.

## What's machine-checked vs. judgement

- **Machine-checked already, no new work:** the starter invariants
  (`spec/invariants.test.ts`), static/client-side-only (inherent to the
  Vite/TS static template), process evidence (`pnpm check:evidence`), deploy
  liveness (CI).
- **Machine-checked, next step:** the core-interaction contract from "Design
  decisions forced by the spec" — triggering Race ends both panels'
  bar-height sequences in non-decreasing order, with each panel's comparison
  counter non-zero and frozen once sorted. Added as a new `spec/*.test.ts`,
  replacing `spec/starter.test.ts`. Starts red.
- **Judgement only, no test possible:** both viewports genuinely reading well
  (not just "not broken" — legible bar widths, no overlap); whether the race
  mechanic actually reads as "one strong idea with a point of view" rather
  than a data-structures demo; the copy's tone and whether it commits to an
  angle.
