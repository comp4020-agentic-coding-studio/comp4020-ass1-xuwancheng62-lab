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

## Amendment 1 — correctness before explanation (approved 12 August 2026)

The frozen plan above is left as written. This section records a deliberate
amendment made after using V1, per the standing rule that departures get
flagged rather than edited into the plan.

**What using V1 revealed.** The race delivered the headline comparison
(Bubble 120 vs Quick 49 on the same shuffle) but not the *explanation*: while
the bars are moving you cannot tell what either algorithm is deciding. The
frozen plan assumed "watch the cost happen" would carry the strategy
difference on its own. It doesn't — the counter carries the cost, and nothing
carries the strategy.

Inspecting the implementation found the cause, plus two defects that no
existing check could see. Both were verified by running the real generators
from `src/sorting.ts`, not inferred from reading:

- **`SortStep` discards the decision.** It yields `{ array, comparisons }`.
  Each generator knows which indices it is comparing (and Quick knows its
  pivot), but that is thrown away at the `yield`, so the renderer has nothing
  to highlight with. This is an information problem, not a styling one.
- **Merge Sort renders impossible arrays.** `mergeRange` copies `left`/`right`
  out of `arr` and then writes merged values back into the live `arr` while
  yielding per comparison, so mid-merge frames mix overwritten cells with
  not-yet-consumed ones. Measured over `[5,2,8,1,9,3,7,4,6]`: **15 of 29
  merge frames contain a duplicate value** (e.g. `[2,2,8,1,9,3,7,4,6]`) versus
  0 of 36 for Bubble and 0 of 22 for Quick. The page is currently displaying
  array states the data is never in.

### What changes

1. **Merge Sort correctness first.** Every rendered intermediate frame must be
   a valid permutation of the original input. Impossible intermediate arrays
   are not to be visualised. This is the first task, ahead of any explanatory
   work — the clearest thing on screen is currently also the least true.
2. **A permutation spec test.** Assert that every frame yielded by every
   algorithm preserves the same multiset as the starting array. This converts
   a defect found by hand into standing backpressure. It starts red against
   today's Merge Sort, which is the point.
3. **A new harness rule** (`CLAUDE.md`): animated and process-based
   interactions must be verified over time, not only through still
   screenshots. Six screenshots across both viewports passed while over half
   of Merge Sort's frames were invalid, because the defect lives in the
   sequence rather than in any single frame.
4. **Then expose the smallest useful algorithm state.** After correctness is
   restored: the currently compared indices for all three algorithms, and the
   pivot for Quick Sort. Carried by colour on the existing bars — Bubble then
   reads as an adjacent pair crawling repeatedly left-to-right, Quick as a
   fixed pivot with a scan sweeping past it. That contrast *is* the strategy
   difference.
5. **Interface structure unchanged.** No new controls, panels, pages or
   layout. At most one shared legend line. This is a correction to the
   explanatory visual system, not a scope expansion; the MVP algorithm set,
   the race mechanic, the four frozen decisions above and the deferred ideas
   all stand as written.

### Findings noted, deliberately not yet acted on

Recorded so they are not lost, and explicitly *not* to be changed as a side
effect of the work above unless correctness requires it:

- **Bubble Sort's comparison count is a constant, not a measurement.** There
  is no early-exit `swapped` flag, so it always runs the full `n(n−1)/2`.
  Across 200 random shuffles the final count was `120` every single time — it
  would report 120 for an already-sorted array too. Half the race's headline
  number therefore isn't responding to the input. Whether to add the early
  exit is a product decision (it makes the number honest, and makes Bubble
  beat Quick on nearly-sorted input) and is not being taken here.
- **The bar transition is dead code.** `renderBars` replaces every bar with a
  freshly created element each frame, so `transition: height 60ms linear` in
  `styles.css` can never fire — CSS transitions need the same element to
  persist. Bars teleport rather than move. Read from the code, not measured.
- **Step timing is an unresolved tradeoff.** At `STEP_MS = 30` a
  compared-pair highlight is on screen for ~30ms, at the edge of being
  readable as "those two, specifically." Slowing to ~100ms makes each decision
  legible but stretches Bubble's 120 steps to ~12s, weakening the race. Left
  open deliberately; to be decided by looking at it once (4) is built, not
  guessed at now.

## Amendment 2 — V1.2: insertion sort, speed control, multi-run stats

Requested as one iteration after testing V1.1. All three items trip the
trigger test (a new algorithm in the selector, two new things the reader can
do), so they are planned here before implementation.

### 1. Insertion Sort as a fourth option

Amendment to the frozen plan's deferral. The plan deferred Insertion as
"redundant as a fourth O(n²) example next to Bubble unless it's given its own
hook." Measured over 2000 random 16-item arrays, that is only partly right:

| Algorithm | Average comparisons (n=16) | Fewest-comparison wins |
| --- | --- | --- |
| Bubble | 120.0 | 0 / 2000 |
| Insertion | 72.6 | 5 / 2000 |
| Quick | 50.8 | 448 / 2000 |
| Merge | 45.7 | 1547 / 2000 |

Insertion uses ~40% fewer comparisons than Bubble on the same random input,
because it stops its inner scan as soon as the value is in place while our
Bubble has no early exit. That is a real, visible difference, so it earns a
place without the nearly-sorted toggle. **What is still deferred is its
adaptivity story** — "fast when the data is already nearly sorted" — which
genuinely needs an input-shape control and is not in this iteration.

**It must be swap-based, not shift-based.** The textbook version saves the key
to a variable and shifts values right, which leaves the key's old slot holding
a copy — measured at **119881 of 119881 shift frames showing a duplicate
value, i.e. 100%**. That is the same class of defect as the Merge Sort bug in
Amendment 1. Walking the value down with adjacent swaps is permutation-safe at
every frame and produces an identical comparison count. The existing
permutation test covers it automatically, and would fail loudly on the naive
version.

Highlighting: `compared: [j, j + 1]`, the same as Bubble. The two then differ
by *motion* rather than colour — Bubble's pair crawls rightward across the
whole array, Insertion's walks leftward from a growing sorted prefix. Marking
that sorted prefix with a third role would make the difference plainer; not
doing it in this iteration, noted as an option.

### 2. Speed control

A single `range` input labelled Slow → Fast, sitting with the existing
controls. No new section.

- Expressed as **steps per second** so that dragging right means faster:
  range 2–50, default 10, giving a delay of `1000 / rate` — 500ms at the slow
  end, 20ms at the fast end, and **100ms at the default**, unchanged from
  V1.1.
- **Adjustable mid-race**, as asked. This works without restarting anything
  because each step schedules the next one, so reading the current rate at
  schedule time is enough — no change to the animation model.
- The slider stays enabled while the race runs, unlike the other two controls.

### 3. Multi-run statistics

A button that runs all four algorithms over **20 shared random arrays** and
fills a small table: average comparisons per algorithm, and how often each
used the fewest comparisons.

- Runs by draining the same generators the animation uses, so there is one
  source of truth for what a comparison is. No animation, no timers: ~6000
  steps total, which is a few milliseconds, so it can be synchronous without
  blocking anything perceptibly.
- Every algorithm sees the identical 20 arrays, so the comparison is paired.
- **The wording has to stay precise.** This measures *comparisons under these
  inputs*, not runtime and not "speed". The table's caption says so, in those
  terms: it counts comparisons on 20 random shuffles of 16 items, and says
  nothing about wall-clock time, memory, cache behaviour, or how these perform
  on larger or differently-shaped inputs. No claim that one algorithm is
  "fastest".
- Ties on fewest comparisons are counted for every algorithm that ties, and
  the caption notes it, so the win counts can exceed 20.

### Decision this iteration forces — the meaning of "winner"

Reported at the end of V1.1 and now unavoidable. The live race marks the panel
that finishes **animating** first, which is decided by frame count; the panel
reports **comparisons**. Those disagree in **112 of 500 Merge-vs-Quick races
(22%)**, because Merge emits an extra frame per merge tail and Quick an extra
frame per pivot placement. Frame count is an artefact of how we chose to emit
frames, not a property of the algorithm.

A stats table that ranks by fewest comparisons while the border ranks by
frames would put two contradicting definitions of "better" on one page. So
this iteration picks one.

**Decided: the border means fewest comparisons**, awarded once both panels
finish, matching the counters and the stats table and the page's whole point of
view. Frame count stops being a ranking anywhere on the page. Accepted cost:
the border no longer reflects which animation you literally watched end first,
which with a speed slider was never a property of the algorithm anyway. On a
tie both panels are marked, rather than inventing a tiebreak.

**Decided: no sorted-prefix marker for Insertion** in this iteration — exactly
the "same comparison highlighting" as the others. Whether motion alone
distinguishes Insertion from Bubble is a judgement call to make by watching
V1.2, and a third role stays available if it doesn't.

### Explicitly unchanged

Bubble's missing early exit (its 120.0 average is exactly the constant from
Amendment 1), input-shape variations, the dead CSS transition, the two-panel
structure, and the four frozen decisions. Insertion is a fourth *option*, not
a third panel.

## Amendment 3 — V1.3: input shape (locked 12 August 2026)

Reviewed and locked with one change to the proposal: **Nearly reversed replaces
exact Reversed**, symmetric in spirit with Nearly sorted, so all three
conditions are sampled and the multi-run statistics stay meaningful in all
three. That change dissolved both open decisions this amendment originally
carried — see "Decisions, locked" below. Edited in place before approval, on
instruction; frozen from here.

V1.2 answers "how much work does each algorithm do on this shuffle". The
question it raises is whether the winner is a property of the *algorithm* or of
the *data*, and right now the page quietly implies the former, because every
array it has ever shown the reader is a uniform random shuffle. This adds
starting shape as a variable of the existing mechanic. Trips the trigger test:
it changes what the reader can do.

### The premise, measured first

Worth checking before building, because if the ranking held steady across
shapes there would be nothing to show. It does not hold — **the winner
changes**, and one algorithm goes from best to worst:

Measured over 2000 arrays of each of the three final shapes, average
comparisons and the share of arrays where that algorithm used the fewest:

| Algorithm | Random | Nearly sorted | Nearly reversed |
| --- | --- | --- | --- |
| Bubble (fixed loops) | 120.0 — wins 0% | 120.0 — wins 0% | 120.0 — wins 0% |
| Insertion | 72.8 — wins 0.5% | **24.8 — wins 99.7%** | 115.1 — wins 0% |
| Merge | **45.8 — wins 75.8%** | 36.8 — wins 0.5% | **36.9 — wins 100%** |
| Quick (last-element pivot) | 51.0 — wins 30.3% | 94.6 — wins 0% | 90.8 — wins 0% |

Four readings the current page cannot show, and this one can:

- **The winner changes with the data**, which is the whole point: Merge wins
  Random and Nearly reversed, Insertion wins Nearly sorted almost every time.
- **Insertion swings furthest of any algorithm** — 24.8 to 115.1, nearly the
  worst possible, across two conditions that look similar in a still
  screenshot. Same algorithm, same metric, opposite verdicts. This is the
  adaptivity story Amendment 2 deferred for want of an input-shape control.
- **Quick gets worse on nearly-ordered data** (51.0 → 94.6), which is
  counter-intuitive and the most interesting thing on the page.
- **Merge barely moves** (45.8 → 36.8 → 36.9). Its cost is close to independent
  of the input, a genuine property of merge sort, and it reads clearly against
  the other three moving around it.

Note the two quadratic sorts are *not* interchangeable under this lens even
though both are O(n²): Insertion ranges over 90 comparisons across the three
shapes while our Bubble sits at exactly 120.0 in all three. That contrast is
the clearest thing the nearly-shapes buy, and it is also the reason the Bubble
variant has to be named — see the labelling requirements below.

### What changes

One control, in the existing `.controls` row next to the speed slider: a
`select` labelled **Starting data**, options Random / Nearly sorted / Nearly
reversed, default Random. No new panel, no new section, no change to the race,
the algorithms, the comparison metric, the speed control or the highlighting.

**The shape is one shared experimental condition, not two settings that happen
to agree.** It feeds the single place a starting array is made, so:

- Selecting a shape regenerates the shared array immediately, by the same path
  the New start button uses. Both panels keep receiving *the exact same array* —
  unchanged from V1.0, where each panel gets its own copy of one `sharedArray`.
- The statistics run generates its 20 arrays from the currently selected shape,
  and all four algorithms run over that same set of 20 (already guaranteed by
  `comparisonStats(inputs)` taking the inputs and looping algorithms inside).
- Changing the shape **clears any statistics already on screen**. Numbers from
  one condition sitting under a caption naming another is precisely the false
  claim this amendment is otherwise trying to avoid.

### Defining the two "nearly" shapes — a symmetric pair, chosen on evidence

The definition changes what the reader sees, so four candidates for
nearly-sorted were measured over 500 arrays each:

| Definition | Insertion avg | Insertion wins | Avg inversions | Came out fully sorted |
| --- | --- | --- | --- | --- |
| 2 adjacent swaps | 16.8 | 500/500 | 1.9 | **32/500** |
| 2 swaps anywhere | 31.9 | 444/500 | 17.3 | 4/500 |
| 3 swaps anywhere | 38.2 | 372/500 | 23.8 | 0/500 |
| **Move 2 values to random slots** | **25.0** | **498/500** | **10.3** | 8/500 |

**Chosen: take a fully ordered base, pull two values out, drop them back in
random positions; resample if the result lands exactly back on the base.** One
generator, two bases — ascending gives Nearly sorted, descending gives Nearly
reversed — which is what makes the pair symmetric by construction rather than
by intention. Reasons for the perturbation, in order:

- Adjacent swaps look identical to sorted (average max displacement 1.1) and
  6% of the time *are* sorted — a "nearly sorted" array that is sorted reads as
  a bug.
- Three swaps anywhere drifts toward random: Insertion wins only 74%, so the
  demonstration stops demonstrating.
- The chosen one is describable to a reader in one sentence — "sorted, then two
  values moved" — and is visibly disturbed without being random.

Measured properties of the pair, both over 2000 arrays: Nearly sorted averages
**10.0 inversions of a possible 120**, Nearly reversed **109.8 of 120** — so
they sit near-symmetrically either side of Random's 60.2, which is what "in
spirit" has to mean for this to be one condition axis rather than two unrelated
presets.

### Both nearly-shapes are sampled, so 20 distinct inputs is achievable

The reason exact Reversed was dropped: one array cannot be sampled 20 times.
The perturbed version can — exhaustively enumerated, **22066 distinct arrays are
reachable** with two displacements from either base, so a 20-array sample is
drawn from a large space in all three conditions.

Not automatically distinct, though: an unguarded 20-draw contains a repeat
**3.3% of the time** for Nearly sorted and 3.5% for Nearly reversed. Since the
requirement is 20 distinct inputs, the statistics run **rejects duplicates
within its sample**, measured at 20.04 draws per 20 arrays — free, and with
22066 reachable arrays there is no risk of the loop failing to terminate.

Race length at the 100ms default shifts by shape, worth knowing before it
surprises anyone: Insertion drops to 1.7s on nearly-sorted and rises to 11.7s
on nearly-reversed; Quick rises to 11.4s on nearly-sorted. The speed slider
covers it; nothing to change.

### Naming the variants — required, not optional

Both numbers below are correct measurements that would imply a false general
claim if left unlabelled, and both are things this iteration is explicitly *not*
allowed to fix — so the fix is words on the page. Approved as a requirement of
this iteration, and as the harness rule "A true number can still make a false
claim".

- **Bubble's flat 120.0 across all three shapes** is a property of *our*
  implementation's fixed nested loop, not of bubble sort. Textbook bubble sort
  with a swapped-flag early exit is one of the *most* adaptive of the four and
  would take 15 comparisons on already-sorted input. A reader watching Bubble
  sit at 120 while Insertion drops to 24.8 would reasonably conclude bubble sort
  cannot exploit order. That conclusion is wrong, and the nearly-sorted shape is
  what makes it visible. Stated as: **basic/fixed-loop version, no early exit**.
- **Quick's rise to 94.6 is caused by taking the last element as pivot.** A
  random or median-of-three pivot does not degrade this way on nearly-ordered
  input. The honest claim is "this pivot choice", not "quick sort". Stated as:
  **last-element pivot**.

Where they appear, so the label travels with the number rather than sitting in
a footnote nobody reads:

1. A short note with the controls, naming both variants — covers the live race.
2. In the statistics table, on the Bubble and Quick rows, next to the algorithm
   name — covers the averages, which is where a reader is most likely to
   generalise from a single number.

Only those two rows carry extra text; Insertion and Merge are the ordinary
textbook algorithms and need no qualifier.

### Decisions, locked

1. **Shapes: Random / Nearly sorted / Nearly reversed.** Exact Reversed is out —
   it cannot produce 20 distinct samples, which would have forced a per-shape run
   count and an exact-vs-average distinction in the caption. Sampling all three
   removes that whole branch.
2. **20 runs for every shape**, distinct within the sample. The first open
   decision from the proposal is void.
3. **"New shuffle" → "New start".** Still correct to do: under Nearly sorted the
   button does not produce a shuffle, it produces a fresh nearly-sorted array.
   The label should say what it does under all three conditions. This was the
   second open decision; keeping it, as the reason survived the shape change.
4. **The shape select is disabled while a race runs**, like the algorithm
   selects and the two buttons — changing the condition mid-race would leave the
   panels racing on an array the control no longer describes. The speed slider
   remains the one control that stays live.

### Explicitly unchanged

No Bubble early exit, no alternative Quick pivot strategies, no Bogo Sort, and
the dead CSS transition stays — all as instructed. The first two now have a
visible symptom and a named reason, which is better evidence than either would
be if quietly fixed. Also unchanged: the four algorithms themselves, the
comparison metric, the speed control, the two-panel race structure, the
winner-by-fewest-comparisons rule, the highlighting, and the array length of 16.

## What's machine-checked vs. judgement

- **Machine-checked already, no new work:** the starter invariants
  (`spec/invariants.test.ts`), static/client-side-only (inherent to the
  Vite/TS static template), process evidence (`pnpm check:evidence`), deploy
  liveness (CI).
- **Machine-checked, added by Amendment 1:** every yielded frame of every
  algorithm is a permutation of the starting array. Starts red against the
  current Merge Sort.
- **Machine-checked, added by Amendment 2:** the permutation and
  compared/pivot-index tests extend to Insertion Sort for free, since both loop
  over every registered algorithm — adding the algorithm to the map is enough to
  put it under test. Plus: a race still completes when the speed slider is moved
  mid-run, and the stats run reports one row per algorithm with an average
  strictly between the best and worst possible comparison counts.
- **Judgement only, added by Amendment 2:** whether Insertion and Bubble read as
  *different strategies* rather than two slow ones, given they share the same
  highlight colour and differ only in the direction their pair travels; and
  whether the stats table's caption is precise enough that nobody leaves
  thinking it measured runtime.
- **Machine-checked, added by Amendment 3:** the permutation and highlight tests
  become parameterised by shape, so every algorithm is checked against every
  starting shape rather than only against random shuffles — verified in advance
  as 0 bad frames in 408204 frames across all four algorithms and all three
  shapes, so this is standing backpressure for later changes rather than a fix
  for a known bug. Plus: each shape generator returns a permutation of 1..16;
  each nearly-shape is neither its pure base nor as disordered as random
  (asserted by inversion count, the measurable form of "nearly"); a 20-array
  sample contains 20 distinct arrays; both panels start from an identical array;
  the statistics run scores every algorithm on the same inputs; and the selected
  shape reaches both the race and the statistics.
- **Judgement only, added by Amendment 3:** whether a reader actually reaches
  "the winner depends on the data" rather than "merge sort is best", which is
  what one badly-worded sentence would cost; whether the two nearly-shapes are
  visually distinguishable from Random at a glance in the bars; and whether the
  variant note reads as useful honesty or as an excuse.
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
