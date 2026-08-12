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

## Amendment 4 — V1.4: the three shapes side by side (13 August 2026)

An information-architecture correction, requested after testing V1.3. No
algorithm, input generator, metric or race behaviour changes here — this
amendment moves and reshapes what is already on the page.

### The fault in Amendment 3, stated plainly

Amendment 3 made the shape *one shared experimental condition* for both the race
and the statistics. For the race that is right: one animation can only run on one
array. For the statistics it was wrong, and it was wrong in a way that defeated
the point of the amendment.

The insight V1.3 exists to deliver is **the ranking rearranges when the input
changes**. Under Amendment 3, reaching that insight costs: select a shape, press
Run, scroll to the table, read four numbers, *memorise them*, scroll back up,
select the next shape (which deliberately wipes the table), press Run, scroll
down again, and compare against memory. Three times. The comparison the page is
about happens in the reader's head, from remembered numbers, or it doesn't
happen. A single race is a poor argument for "it depends on the data" precisely
because you see one condition at a time — the statistics section was supposed to
be the fix for that, and it inherited the same limitation.

**This supersedes Amendment 3's third "What changes" bullet** (statistics drawn
from the currently-selected shape; changing the shape clears the table). That
bullet is not edited — it stands as approved, and this is the record of the
departure. The remaining Amendment 3 decisions are untouched, including the
selector governing the race, the disabled-during-a-race rule, and the sampling
and shape definitions.

### What changes

**1. The statistics table becomes a matrix.** Algorithms down the side, the three
shapes across the top, so it reads two ways at once:

| | Random | Nearly sorted | Nearly reversed |
| --- | --- | --- | --- |
| Bubble sort *(basic fixed loops, no early exit)* | 120.0 | 120.0 | 120.0 |
| Insertion sort | 72.5 | **25.0** | 115.1 |
| Merge sort | **45.7** | 36.9 | **36.9** |
| Quick sort *(last-element pivot)* | 51.0 | 94.9 | 90.8 |

Averages measured over 500 samples of 20 arrays per shape, so a single press on
the page will land near these rather than on them. The bolded cell held the
lowest average in 500 of 500 samples in every column, so the shape of the table a
reader sees is stable even though the digits are not.

Down a column: the ranking under one condition. Across a row: how one algorithm
responds to the shape. The rearrangement stops being something to remember and
becomes something to see — the highlighted cell moves between columns, which is
the entire claim of this iteration rendered as position rather than prose.

Twelve numbers is more than the four it replaces, and still compact: one table,
one press, no scrolling between conditions at either viewport.

**2. Each shape keeps its own 20-array sample**, generated by the existing
`shapeSample`, scored by the existing `comparisonStats`. Same methodology three
times over, so the columns are comparable: 20 inputs, all four algorithms on the
identical 20 within a column, ties counted for every algorithm that ties.
Necessarily *different* arrays between columns — that is what a shape is.

**3. The statistics section is decoupled from the selector.** The Starting data
select now governs the race only. It no longer clears the table, because there is
no longer a mismatch to prevent: the table names all three conditions in its own
header. One press of Run fills all three columns.

**4. The variant note near the top shrinks to one line.** The full paragraph
moves to the statistics section, where the two numbers it qualifies (Bubble's
flat 120.0, Quick's rise on ordered data) are actually visible next to each
other. The `<small>` variant labels stay in the table's row headers. Nothing is
withdrawn — the harness rule is that the label travels with the number, and after
this change it travels with it more closely, not less. The compact line by the
controls still names both variants, so a reader who never reaches the table is
not misled by the race.

### Why not the alternatives

- **Three separate tables side by side.** Reads as three results rather than one
  comparison, and at 390px they stack — which is the scroll-and-remember problem
  again, just without the button presses.
- **A grouped table with average *and* wins as separate columns per shape.** Six
  data columns will not fit at 390px without horizontal scrolling, and a table
  you have to scroll sideways hides exactly the cross-column comparison this is
  for. Wins instead sit as a small second line inside each cell.
- **Running all three automatically on load.** Tempting, since the insight is the
  point — but it spends 240 sorts before the reader has asked for anything, and
  the brief here is to keep the race primary. One press stays.
- **Dropping the wins column to save space.** It answers a different question
  from the average ("was this typical or one lucky array"), and V1.2 added it
  deliberately. Compressed, not removed.

### Decisions, locked

1. **Averages are the primary number in each cell; wins are a small second
   line.** Both are kept, with the average given the visual weight because the
   cross-column comparison is what the matrix is for.
2. **The fewest-comparisons highlight is per column**, not per table. A table-wide
   highlight would mark one cell out of twelve and imply a single overall winner,
   which is the opposite of the point.
3. **Column headers are generated from the shape list**, not hand-written in the
   markup, so a fourth shape could not desynchronise the header from the data.
4. **The selector no longer clears the statistics.** Superseded as above.

### Explicitly unchanged

The algorithms, the input generators and their measured definitions, the
comparison metric, `comparisonStats`, the race itself (two panels, shared array,
winner by fewest comparisons, highlighting, speed slider), the 20-run sample
size, and the array length of 16. Still no Bubble early exit, no alternative
Quick pivots, no Bogo Sort, and the dead CSS transition still stays.

## Amendment 5 — V1.5: does the improvement help? (13 August 2026)

Approved direction, with three changes made by me on review: keep Merge as an
honest experiment rather than reframing it as "no improvement exists", use a
**random pivot** for Quick rather than the middle element, and fix the
incorrect Bubble claim from the measured result. Implementation authorised in
the same message, so this amendment is the record of what was built, written
before the code.

### The gap this closes

V1.4 established that the ranking rearranges with the input shape. But every
number on the page is still a property of *our four implementations*, and two of
those implementations are deliberately weak — Bubble has no early exit, Quick
takes the last element as its pivot. The page says so honestly, and then leaves
the reader with a note instead of evidence. A reader cannot check the claim
"a better pivot would fix this"; they can only be told it.

This iteration turns the four variant caveats into four experiments the reader
can run. The finding is not "improved is faster" — measured below, that is false
for two of the four. The finding is that **an improvement is only an improvement
relative to an input shape**, which is the same argument as V1.4 aimed one level
up: at the code rather than the data.

### The structure

Four compact **What we found** cards after the statistics, one per algorithm.
Clicking a card loads that algorithm into **one shared Original vs Improved
race** below, both sides on the identical array:

**Choose a finding → Original vs Improved → Race**

Not four race sections, and no improved variant in the main race — both were
explicit instructions and both are structural below, not conventions.

### The four improvements, chosen on measurement

Ten candidates were measured before these four were picked. Means over **5000
arrays per shape**, 16 items, counted through the same generators that will
animate, with each improvement's own bookkeeping comparisons **included** —
pivot selection and skip tests are work, and excluding them would rig the race
they appear in.

| Improvement | Random | Nearly sorted | Nearly reversed |
| --- | --- | --- | --- |
| Bubble **+ early exit** | 120.0 → 113.4 | 120.0 → **67.4** | 120.0 → 120.0 |
| Insertion **+ binary search** | 72.7 → **45.0** | 24.9 → *40.6* | 115.1 → **48.4** |
| Merge **+ skip ordered runs** | 45.7 → *55.3* | 36.9 → **32.0** | 36.9 → *50.9* |
| Quick **+ random pivot** | 50.9 → 50.9 | 94.8 → **51.0** | 90.9 → **50.9** |

Four different answers to one question, which is why these four:

1. **Bubble + early exit — the fix works, and only where the fault was.** Stop
   when a pass makes no swaps. This is the specific code that produces the flat
   120.0 in all three columns, the most misleading number on the page. It cuts
   nearly-sorted input by 44%, and does essentially nothing on nearly-reversed
   input (tied on 98% of arrays), because a value that must travel *left* moves
   only one position per pass, so a nearly-reversed array still needs nearly
   every pass. It never costs more than the original: 0 losses in 400,000
   arrays.
2. **Insertion + binary search — the improvement trades.** Binary-search the
   insertion point instead of walking down. It cuts random by 38% and
   nearly-reversed by 58%, and is **63% worse on nearly-sorted input** (worse on
   99.9% of arrays), because it gives up the early break that made Insertion the
   nearly-sorted champion in exchange for a near-constant 38–49 comparisons on
   any input. This is the most valuable card on the page: paying comparisons to
   buy predictability is a real engineering trade, not a mistake.
3. **Merge + skip ordered runs — the experiment that fails on two of three
   shapes, kept as an experiment.** One comparison asks whether the two sorted
   runs are already in order end-to-end, and skips the whole merge when they
   are. It targets Merge's one real weakness — it is the least *adaptive* of the
   four, swinging only 45.7 → 36.9 across shapes where Insertion swings 24.9 →
   115.1. The skip fires on 38% of merges and is paid for on the other 62%: 13%
   better on nearly-sorted, 21% and 38% worse on the other two. Kept, and framed
   as what it is. Context for why nothing wins here: `ceil(log2(16!)) = 45` is
   the proven floor for any comparison sort at this size, and our unmodified
   Merge already averages **45.7 on random** — 0.7 comparisons from optimal.
   There is almost nothing left to win at n=16.
4. **Quick + random pivot — the fix is free, and its claim needs care.** Choosing
   the pivot at random costs no comparisons at all, and flattens the shape
   dependence completely: 50.9 / 51.0 / 50.9 across the three shapes, cutting
   the nearly-ordered cases by 46% and 44% while leaving random unchanged
   (50.9 → 50.9). That flatness *is* the finding — the input shape stops being
   able to choose the pivot.

### What the random pivot does not claim

**It improves expected behaviour. It does not improve the worst case,** which
stays O(n²) — a random pivot can still pick the smallest or largest value at
every level. What changes is that no *input shape* can force that any more; it
becomes unlikely rather than triggered. Measured, so the page can say it and
mean it:

- On random input a single run ranged **39–94** comparisons across 5000 arrays,
  and over 20,000 runs the improved version exceeded the *original's own mean*
  on **44.3%** of them. The worst single run cost **95** — worse than the
  original's 50.9 average. Bad partitions still happen.
- The same array raced 12 times produced **9.5 distinct** comparison counts on
  average, and never once produced 12 identical results in 2000 trials per
  shape. The variance is real and visible.

**The middle element was measured and deliberately rejected.** It is better on
our three shapes (50.8 / 41.3 / 44.5, beating the random pivot on both nearly
shapes) and it keeps the race deterministic. It was rejected on review because
it fixes *the shapes we happen to generate* rather than demonstrating the
principle that matters — making a consistently bad partition unlikely. Recording
this because the plan should show that the better number lost to the better
argument, not that it went unnoticed. Median-of-three was also measured and is
worse than both at this size (58.9 / 56.0 / 58.4) — its three selection
comparisons per partition outweigh its benefit when n is 16.

### Also measured and rejected

- **Insertion, binary search plus a one-comparison "already in place" guard**
  (51.4 / 29.0 / 59.1) — an attempt to keep the adaptive best case. Worse than
  plain binary search on all three shapes, and *still* worse than the unmodified
  Insertion on nearly-sorted. There is no free lunch here to offer.
- **Merge, four further variants:** skip only on runs ≥ 4 (+12.1% / −15.5% /
  +18.9%), skip only on runs ≥ 8 (+6.3% / −9.8% / +8.1%), insertion sort under 4
  (+2.2% / −8.3% / +17.3%), insertion sort under 8 (+15.3% / −20.1% / +73.4%),
  natural merge over existing runs (+18.6% / −9.9% / +31.5%). Every one loses on
  two of three shapes. The skip test is kept because it is the simplest to
  explain and targets the weakness squarely.

### A claim already on the site is wrong, and this fixes it

`index.html` currently states that a bubble sort with early exit "would be among
the fastest on nearly-sorted input, not the slowest." That is false. Measured
against the other three algorithms as shipped, an early-exit bubble sort scores
**67.4 on nearly-sorted input and ranks 3.04 of 4** on average — ahead only of
our last-element Quick sort (94.8), behind Insertion (24.9) and Merge (36.9). It
ranks 4.00 of 4 on random and 3.78 on nearly-reversed.

The corrected claim: early exit removes the *flat* 120, not Bubble's
last-or-second-last place. I wrote the wrong sentence, and it stayed green
through every check, because nothing tests what a reader concludes — the same
failure mode the "a true number can still make a false claim" rule was added
for. V1.5 makes it checkable in the browser for the first time, which is the
better fix than more careful wording.

### Decisions, locked

1. **One shared race area, four cards.** Clicking a second card swaps the
   contents of the same area rather than adding another — asserted by counting
   areas in the DOM, so a regression fails rather than merely looking cluttered.
2. **The flow is enforced, not described.** The area starts empty with its
   controls disabled; choosing a card is what enables them. "Choose a finding
   first" is then a property of the page, not an instruction to be ignored.
3. **No new selectors.** The improvement race takes its shape from the existing
   **Starting data** selector and its speed from the existing slider. The
   selector governs races and still never touches the statistics — Amendment 4
   stands unchanged.
4. **One array, both sides, regenerated by New array.** Race can be pressed
   repeatedly on the same array, which is how the random pivot's variance becomes
   visible rather than merely asserted.
5. **Improved variants live in a separate registry** (`IMPROVED_ALGORITHMS`),
   keyed by the same algorithm names. The main race's dropdowns are built from
   `SORT_ALGORITHMS`, so they *cannot* offer an improved variant — structural,
   not a convention to be remembered.
6. **No measured number is hard-coded into the page.** The cards state the
   *direction* in words; every number a reader sees is computed live in their
   browser. The measurements in this amendment are the evidence for those
   directions, not values to be copied into markup — that is what made the
   twelve Wikimedia URLs on crit 2 look right and 404.
7. **Winner is fewest comparisons**, the Amendment 2 definition, unchanged. With
   a random pivot the improved Quick side can lose a race it usually wins; that
   is the honest display of an expected-case improvement, not a bug to smooth
   over.

### Explicitly unchanged

The four original algorithms, byte for byte — every number in the statistics
matrix must stay reproducible. The input generators, the comparison metric,
`comparisonStats`, `shapeSample`, the statistics matrix and its methodology, the
main race (two panels, shared array, winner by fewest comparisons, highlighting,
locked selector mid-race), the 20-run sample size, and the array length of 16.
No Bogo Sort, and the dead CSS transition still stays.

## Amendment 6 — V1.6: 20 runs of every shape, per card (13 August 2026)

**Not yet approved — written before any code, because this meets the trigger
test twice over: it adds a block to a section and it changes what the reader can
do.** Requested: keep the animated Original vs Improved race exactly as it is,
and add a 20-run comparison below it showing Random, Nearly sorted and Nearly
reversed *together* — Original average comparisons, Improved average
comparisons, and Improved wins out of 20 — with the same generated arrays given
to both variants in each trial, applied consistently to all four cards. Stated
purpose: **an "improvement" may help on some input shapes but not others.** One
part of the request is ambiguous and is raised in "The open question" below
rather than settled quietly.

### The gap this closes

V1.5's animated race is one array. That is the right unit for *watching* the
mechanism, and the wrong unit for *believing* the claim — and for two of the four
cards the single race actively misleads:

- **Quick + random pivot on random input is a coin flip.** Over 20,000 samples of
  20 arrays each, the improved side won between 2 and 18 of the 20. A reader who
  presses Race once on random input learns nothing about the pivot, but will
  believe they did.
- **Bubble + early exit on nearly-reversed input ties.** One race shows two equal
  counters and no visible reason. The measured fact — tied on 15–20 of every 20
  arrays, and *never once worse* in 400,000 arrays — is invisible in a single
  race.

The cards already state the direction in words. This iteration makes each card's
claim checkable in the reader's own browser, across all three shapes at once, at
the same 20-array sample size the statistics matrix already uses.

### The structure

Inside the one shared improvement area, **below** the two animated panels and
below the "what to expect" line, a three-row table — one row per starting shape,
all three always present:

| Starting data | Original average | Improved average | Improved wins |
| --- | --- | --- | --- |
| Random | … | … | … / 20 |
| Nearly sorted | … | … | … / 20 |
| Nearly reversed | … | … | … / 20 |

The animated race stays byte for byte what V1.5 shipped: same panels, same
controls, same single array, same winner rule. Nothing is moved to make room.

Each of the 60 trials generates one array and hands **that same array** to both
variants, then counts both through `countVariantComparisons` — the same one
definition of "a comparison" the animated race and the statistics matrix use,
with each improvement's own bookkeeping included. Fairness is therefore
structural: there is one array variable per trial and both counts read it, which
is asserted in the tests rather than described in the caption.

One press is 60 arrays × 2 variants = 120 sorts of 16 items. Measured at
**0.3–1.0 ms** per press for all four algorithms (100 presses each, timed
directly), so this runs synchronously on the click like the statistics button
does, and needs no progress state.

### What the reader will actually see, measured first

Means and ranges over **20,000 samples of 20 arrays**, per algorithm per shape,
through the generators that will ship. "won/tied" are counts out of 20:

| Card | Shape | Original | Improved | Improved wins | Tied |
| --- | --- | --- | --- | --- | --- |
| Bubble + early exit | Random | 120.0 | 113.5 | 16.3 (9–20) | 3.7 |
| | Nearly sorted | 120.0 | **67.3** | 19.5 (16–20) | 0.5 |
| | Nearly reversed | 120.0 | 120.0 | **0.4 (0–5)** | **19.6 (15–20)** |
| Insertion + binary search | Random | 72.6 | **45.0** | 19.9 (18–20) | 0.0 |
| | Nearly sorted | 24.9 | *40.6* | **0.0 (0–1)** | 0.0 |
| | Nearly reversed | 115.2 | **48.4** | 20.0 (20–20) | 0.0 |
| Merge + skip ordered runs | Random | 45.7 | *55.2* | 0.0 (0–1) | 0.0 |
| | Nearly sorted | 36.9 | **32.1** | 17.0 (9–20) | 1.1 |
| | Nearly reversed | 36.9 | *50.9* | 0.0 (0–0) | 0.0 |
| Quick + random pivot | Random | 51.0 | 51.0 | **9.6 (2–18)** | 0.9 |
| | Nearly sorted | 94.8 | **51.0** | 19.7 (16–20) | 0.0 |
| | Nearly reversed | 90.7 | **50.9** | 19.4 (15–20) | 0.1 |

Every card ends up making the intended point on its own terms, which is why the
block is worth adding to all four rather than to the two that lose:

- **Bubble**: helps everywhere it can, does nothing where the fault isn't.
- **Insertion**: the cleanest statement of the whole page — 19.9/20 on random,
  0/20 on nearly sorted. Same code, same day, opposite verdicts.
- **Merge**: 17/20 on one shape, 0/20 on the other two.
- **Quick**: two decisive shapes and one shape where it is a coin flip, which is
  what "improves the expected case, not every case" looks like as numbers.

### Ties: the third column cannot be only "wins"

Bubble on nearly-reversed input is the problem case. A bare **"Improved wins:
0/20"** claims the fix failed. The measured truth is that the improved side tied
on 15–20 of the 20 arrays and was **never worse on a single array in 400,000** —
the fix is inapplicable there, not beaten. That is exactly the "a true number can
still make a false claim" failure the harness rule exists for, so:

**Decision: the three requested columns stay as the three columns, and the wins
cell carries the tie count underneath it** as small text (`0 of 20 · 20 tied`),
the same "big number, quieter number under it" pattern the statistics matrix
already uses for its win counts. Plus a caption sentence: a win means the
improved variant used *strictly fewer* comparisons on that array; identical
counts are ties, counted separately and belonging to neither side.

This is one addition beyond what was asked for, and it is flagged here rather
than made silently. If you'd rather have exactly three numbers, say so and the
tie count comes out — but then the Bubble card's nearly-reversed row reads as a
failure it isn't.

### When it runs

**Decision: automatically when a card is chosen**, so the flow stays *one click*
and the table is never an empty frame the reader has to notice a button for. Plus
a **Run 20 more arrays of each shape** button in the same area to re-run it,
because the wobble is itself a finding — pressing it repeatedly on the Quick card
moves the random row's wins between 2 and 18 while the two decisive rows barely
move, which is the difference between an expected-case improvement and a
guaranteed one made visible without a word of copy.

### The starting-data selector does not touch this table

The table shows all three shapes at once, so the selector has nothing to select.
This is the same decision Amendment 4 locked for the statistics matrix and for
the same reason: a control that appears to change a table showing every value of
the thing it controls is a lie about what the table is. The selector keeps
governing the two races only — the main one and the animated improvement one.

### The open question — "and speed adjustment also need"

Two readings, and they need different code:

1. **The improvement race needs its own speed control.** V1.5 decision 3 said
   "no new selectors" and wired the improvement race to the *existing* slider up
   by the main race — which works, and is ~1500px above the thing it controls at
   390px wide. A reader who reaches the cards has no visible way to slow the
   animation down.
2. **The existing slider must reach the improvement race.** It already does:
   `currentStepMs()` is read at every scheduled step, so dragging the top slider
   changes the improvement race's speed mid-run.

Since (2) already holds, I read the request as (1). **Proposed: a Speed slider in
the improvement area's own controls, next to its New array and Race buttons**,
same 2–50 range and same default as the main one, driving the improvement race
only. Two independent sliders, each sitting beside the race it controls, rather
than two views of one value that have to be kept in sync.

This deliberately supersedes V1.5 decision 3 for speed only — the shape still
comes from the existing selector. Per the frozen-plan rule I am not editing that
decision; this amendment overrides it in the open, and if reading (2) was what
you meant, the answer is that it already works and nothing needs building.

### Approved with corrections (13 August 2026)

Approved for implementation, with corrections made by me on review. Recorded here
rather than by editing the proposals above, so the plan still shows what was
proposed and what I changed:

1. **Show wins / ties / losses, all three, as numbers.** This replaces the
   "wins with a tie count underneath" proposal in "Ties: the third column cannot
   be only wins". Three explicit counts per shape, so Bubble's nearly-reversed row
   states `0 / 20 / 0` outright instead of relying on small print to stop `0` from
   reading as a failure.
2. **A local speed slider for the improvement race** — reading (1) of the open
   question. Supersedes Amendment 5 decision 3 for speed only; the shape still
   comes from the existing Starting data selector.
3. **Each improvement compares against its own original only**, never against
   another algorithm. Already true of the design; stated here so it is a fixed
   contract rather than an accident of the current code.
4. **Keep the page concise — no long explanatory text.** The interaction and the
   numbers are the evidence. So: no new prose paragraphs anywhere in this
   iteration, a caption of at most two short sentences, and nothing added that
   restates in words what the table already shows.

### Decisions, locked (pending approval)

1. **The animated race is unchanged.** Nothing about the panels, the single
   array, the winner rule or the highlighting moves. The block is additive, and a
   test asserts the animated race still runs after a comparison has been run.
2. **Same array to both variants per trial**, one array variable read twice —
   asserted structurally, not claimed in prose.
3. **All four cards get the block**, driven by the same code path keyed by
   algorithm, so a card cannot quietly lack it.
4. **20 arrays per shape**, the existing sample size, so the numbers here and in
   the statistics matrix mean the same thing.
5. **Wins are strict**; ties are counted and shown, and belong to neither side.
6. **No measured number is hard-coded into the page** — Amendment 5 decision 6
   carries. The table above is the evidence for the test bounds, not values to
   copy into markup.
7. **The table clears when the card changes**, then repopulates for the new card,
   so a reader can never read Bubble's numbers under Insertion's heading.
8. **Averages are shown to one decimal**, matching the statistics matrix.

### Explicitly unchanged

The four original algorithms and the four improved ones, byte for byte. The input
generators, the comparison metric, `comparisonStats`, `shapeSample`, the
statistics matrix and its methodology, the main race, the four cards and their
copy, the one-shared-area structure, the separate `IMPROVED_ALGORITHMS` registry,
the 20-run sample size, and the array length of 16. No Bogo Sort, and the dead
CSS transition still stays.

## Amendment 7 — V1.7: cut the copy, unify the two tables (13 August 2026)

The brief, in your words: add a small tolerance to the average-comparison tint so
noise-sized differences stay neutral, keep the averages and the win/tie/loss
counts exactly as they are, then stop adding features and do a clarity pass.
Main priority: **there is too much text.** Cut explanatory copy aggressively while
preserving the important caveats, and let the animation, the statistics and the
cards carry the explanation. Keep the story obvious — Race → Statistics → What we
found → Original vs Improved — unify the two statistics sections visually, and
finish with a desktop and mobile UX check. Proposals first, no edits.

### How much text there actually is

Counted, not estimated (`index.html` plus the `IMPROVEMENTS` strings):

| block | words |
| --- | --- |
| intro paragraph | 56 |
| variant note by the controls | 23 |
| statistics intro paragraph | 53 |
| statistics caption | 91 |
| `#variant-detail` note | 138 |
| findings intro paragraph | 64 |
| improvement placeholder line | 15 |
| comparison caption | 9 |
| **static total** | **449** |
| four card findings | 111 |
| four "what changed" lines | 74 |
| four expectation paragraphs | 189 |
| **improvement total** | **374** |

A reader at the improvement section has about **650 words** on screen at once, for
a page whose argument is meant to be the moving bars and two tables. The target
below is ~330, roughly half, with every caveat still on the page.

### The tint tolerance, measured first

4,000 independent samples of 20 arrays per cell, recording
`improvedAverage - originalAverage` at the one decimal the page displays:

| cell | mean | p1 | p99 | max abs | inside ±1.5 | ±2.5 | ±3 | ±5 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| bubble/random | −6.47 | −10.70 | −3.30 | 13.50 | 0% | 0% | 0% | 17% |
| bubble/nearlySorted | −52.49 | −68.70 | −35.70 | 75.00 | 0% | 0% | 0% | 0% |
| bubble/nearlyReversed | −0.01 | −0.10 | 0.00 | 0.20 | 100% | 100% | 100% | 100% |
| insertion/random | −27.62 | −33.00 | −22.40 | 35.30 | 0% | 0% | 0% | 0% |
| insertion/nearlySorted | +15.64 | +13.20 | +17.90 | 19.00 | 0% | 0% | 0% | 0% |
| insertion/nearlyReversed | −66.73 | −68.80 | −64.30 | 70.00 | 0% | 0% | 0% | 0% |
| merge/random | +9.57 | +8.40 | +10.60 | 11.20 | 0% | 0% | 0% | 0% |
| merge/nearlySorted | −4.80 | −7.20 | −2.60 | 8.10 | 0% | 1% | 3% | 57% |
| merge/nearlyReversed | +14.02 | +13.60 | +14.40 | 14.60 | 0% | 0% | 0% | 0% |
| quick/random | −0.04 | −5.20 | +5.30 | 7.40 | 47% | 73% | 81% | 97% |
| quick/nearlySorted | −43.67 | −52.40 | −34.20 | 55.80 | 0% | 0% | 0% | 0% |
| quick/nearlyReversed | −39.83 | −49.40 | −29.80 | 52.80 | 0% | 0% | 0% | 0% |

**Proposed: ±2.5 comparisons.** Inside that band the row is neutral. It catches
73% of quick/random draws and mistints merge/nearlySorted's real 4.8-comparison
saving as "no difference" in 1% of them. Ten of the twelve cells are 8 to 67
comparisons from zero and are unaffected at any band under 8.

**What the tolerance does not fix, stated plainly.** At 20 arrays quick/random's
spread is about ±5 — wider than merge/nearlySorted's genuine 4.8 saving. So no
fixed band both neutralises quick/random every time and keeps merge's finding:
about one draw in four of quick/random will still be marked. Widening to ±5 would
buy 97% there and destroy merge's row 57% of the time, which is the wrong trade —
erasing a real finding to tidy a noisy one. The rest of the fix is the copy edit
in the next section: quick's expectation line currently promises "at no cost in
comparisons", and that sentence, not the tint, is what a marked row contradicts.

### The cuts, block by block

Each is "keep the caveat, drop the restatement". Proposed replacement text in
full, so this is approvable as written rather than in principle.

1. **Intro, 56 → 29.** "Bubble, insertion, merge and quick sort all solve the
   same problem: put these bars in order. Pick two, press Race, and count the
   work. Then change the starting data." Dropped: "same bars, same starting
   array, wildly different amounts of work" (the two panels show it) and "watch
   the winner change with it" (the statistics section proves it).
2. **Variant note by the controls, 23 → 23, unchanged.** This is the honesty rail
   required by CLAUDE.md — the variant label travelling with the number — and it
   is already one line.
3. **Statistics intro, 53 → 12.** Cut to the one clause that is the reason the
   section exists: "One race is one array, and a lucky array flatters an
   algorithm." Dropped: the description of what the button does (the button says
   it) and the read-down-a-column / read-across-a-row instructions (the table's
   headers say it).
4. **Statistics caption, 91 → 57.** "Big number: average comparisons over that
   column's 20 arrays. Small number: how many of those 20 it used the fewest on —
   ties count for each, so a column can total more than 20. All four algorithms
   get the identical 20 arrays within a column. Comparisons only: not time, not
   memory, and not a claim about longer arrays." Every caveat kept: identical
   arrays, ties inflating a column, comparisons-only, no extrapolation. Dropped:
   "between columns the arrays differ, which is what a starting shape is".
5. **`#variant-detail`, 138 → 68.** "Two columns say more about our code than
   about the algorithms. **Bubble sort** here has no early exit, so it makes the
   same 120 comparisons whatever the data. **Quick sort** takes the last value as
   its pivot, which is why it does more work on nearly-ordered data than on
   random. Insertion and merge are the ordinary versions. Both can be repaired —
   [the section below races the repairs](#improve)." Kept: both variant
   confessions, the ordinary-version note, the link. Dropped: the "still lands
   third of the four, so the flat 120 is our fault and the low ranking mostly
   isn't" qualification — 34 words that the improvement section now demonstrates.
6. **Findings intro, 64 → 35.** "We fixed all four and raced each fix against its
   own original on the same arrays. Two of the four average worse on some starting
   shapes: an improvement is only an improvement for particular data."
7. **Improvement placeholder, 15 → 7.** "Original against improved, from the
   identical array."
8. **Card findings, 111 → 49.** One clause each, since the card is a button and
   the table underneath carries the numbers: bubble "Never responds to its data —
   the same average in all three columns."; insertion "The widest swing on the
   page: best on nearly-sorted, nearly the worst on nearly-reversed."; merge "The
   steadiest and least adaptive: barely notices random from nearly-sorted."; quick
   "Worse on nearly-sorted input than on random, which is backwards."
9. **"What changed" lines, 74 → 74, unchanged.** This is the one sentence of
   mechanism per card, and without it "improved" is a label a reader has to trust.
10. **Expectation paragraphs, 189 → 88.** They now sit directly above a table that
    shows the same thing three shapes at a time, so each keeps only what the table
    cannot show:
    - bubble: "Never costs more than the original: a large saving on nearly-sorted
      input and none at all on nearly-reversed, where a value still moves one
      place per pass." (the reason `0 / 20 / 0` is not a failure)
    - insertion: "Gives up the early break that made it the nearly-sorted
      champion, and gets a near-constant cost on any input in exchange."
    - merge: "Little room to win: no comparison sort can beat 45 comparisons for
      16 items, and merge sort is already close." (the information-theoretic
      floor, which appears nowhere else on the page)
    - quick: "Improves the expected case, not the worst: a random pivot can still
      split badly, but no starting shape can force it." (drops "unchanged on
      random, at no cost in comparisons" — the sentence that contradicts a marked
      random row)
11. **Comparison caption, 9 → 16.** Adds the tolerance as a caveat: "Won / tied /
    lost counts arrays, not comparisons. Differences under 2.5 comparisons are
    left unmarked."
12. **Headings.** "What we found — does the improvement help?" → "What we found".
    The statistics heading stays a question. No heading is added for the race: the
    `h1` and the Race button are the section's label.

Static 449 → 205; improvement copy 374 → 211; on screen at the improvement
section ~650 → ~330.

### Unifying the two tables — two options, one recommended

They are the same kind of object (measured averages over 20 arrays) drawn two
different ways: the statistics matrix has a big average with a small count under
it and a blue "fewest here" cell highlight; the comparison has four flat columns
and green/red row tints. Two visual languages for one idea.

- **Option A, skeleton only.** One shared class for both tables: identical font
  scale, numeric column widths, caption format, header weight. Keeps the four
  columns and the green/red rows. Smallest change, and the page still carries two
  highlight vocabularies.
- **Option B, recommended — same cell anatomy, same highlight.** Three columns
  instead of four: Starting data, Original, Improved, with `19 / 0 / 1` as the
  small line under the Improved average, exactly where the statistics matrix puts
  its win count. The lower of the two averages gets the matrix's existing blue
  `data-fewest` highlight; inside the ±2.5 tolerance neither is marked. All three
  counts stay, unchanged, in the same row.

  Why it is better than A: the finding becomes the highlight moving between the
  Original and Improved columns as you read down the three shapes — the same
  idiom the matrix already uses across its columns, with a comment in `styles.css`
  already saying so. It drops a colour language rather than adding one, drops
  green/red (which carries no meaning for a red–green colour-blind reader, and
  this page has no legend for it), and drops a column at 390px, where the shape
  names currently wrap to two lines.

  What it costs, out loud: it retires the row tints and the `data-direction`
  background rules committed an hour ago in `ad4ddc1`, and rewrites three of the
  DOM tests from that commit (the tint assertion, the three-cells-per-row
  assertion, and the shipped-markup header check). `data-direction` stays on the
  row as the tested contract for the tolerance; it just drives which cell is
  highlighted instead of a row colour. It also relocates the win/tie/loss triple
  from its own column to a line under the Improved average — the three numbers you
  asked for are all still there and still unchanged, but if a separate column was
  the point, say so and I will do Option A instead.

### The story order

Race → Statistics → What we found → Original vs Improved is already the DOM
order, and nothing moves. What makes it hard to see is volume, not sequence: 449
words of connective prose between four interactive things. The cuts above are the
fix. The one structural tidy proposed: the findings section's heading drops its
subclause so the four section labels read as a sequence — "Sorting race", "Does
the winner hold when the data changes?", "What we found", and the chosen card's
own heading.

### Machine-checked vs. judgement, this amendment

- **Machine-checked:** the tolerance is neutral within ±2.5 and directional
  outside it, asserted on constructed averages rather than sampled ones so it
  cannot flake; bubble/nearlyReversed stays neutral and the nine large cells stay
  directional at 20 arrays; every card's copy still names its own variant; the
  `#variant-detail` link still resolves to the improvement section; both tables
  still render one row per shape or algorithm; the win/tie/loss triple still sums
  to 20 wherever it is drawn; no measured number changes.
- **Judgement, yours:** whether the shortened copy still explains enough, whether
  the blue-highlight table reads as clearly as the tinted one, and whether the
  four headings now read as a story.
- **Explicitly unchanged:** every algorithm, every generator, both input
  generators, the comparison metric, all sample sizes, the array length, the two
  registries, the speed sliders, the shape selector's scope, and every number the
  page reports.

## Amendment 8 — V1.8: findings before improvements (13 August 2026)

The brief, in your words: improve the "What we found" hierarchy. Drop the intro
sentence about fixing and racing — that belongs to Improvements, not Findings.
Each card shows the finding first, then the proposed improvement (`Bubble: doesn't
adapt to input → Try: early exit`, and the three equivalents). The cards answer
"what did we discover?" before "what could we change?", and clicking one still
opens the improvement race. Then a final UI cleanup: simplify the remaining long
explanatory text to what is needed to read the results; give bars already in their
final sorted position a distinct colour, the same one in both races; transpose each
improvement table so Original/Improved are rows and the three shapes are columns,
matching the main statistics table; and make the four section headings consistent
and concise — **Race, Statistics, What we found, Improvements**.

Nothing here changes an algorithm, a sample size, the comparison metric or any
measured number. It changes the page's structure, one visual rule, and the copy.

### Two claims that had to be measured before they could be written

**1. "Merge: most stable across input shapes" is false as literally stated.** Mean
of the 20-array average, 2,000 samples per cell:

| algorithm | Random | Nearly sorted | Nearly reversed | range | range in a single run (p1..p99) |
| --- | --- | --- | --- | --- | --- |
| bubble | 120.0 | 120.0 | 120.0 | **0.0** | 0.0 .. 0.0 |
| insertion | 72.6 | 25.0 | 115.1 | 90.2 | 86.4 .. 93.6 |
| merge | 45.7 | 36.9 | 36.9 | **8.8** | 7.6 .. 10.7 |
| quick | 51.0 | 94.8 | 90.8 | 43.8 | 36.2 .. 53.2 |

Our bubble sort is perfectly flat, so *it* is the most stable of the four, and its
flatness is the missing early exit — a defect, not a virtue. Merge is the most
stable of the three that respond to their data at all. This is the trap CLAUDE.md
names ("a true number can still make a false claim"), so the card gets the narrower
true sentence. **Proposed: "Barely changes with the starting data: 46, 37, 37."**
The three numbers are the evidence, they are the row a reader can check against the
table above, and no superlative is claimed. (Rejected: "most stable across input
shapes" — false while bubble's row is flat; "the least adaptive" — true but reads
as criticism of the wrong thing, since being unbothered is merge's selling point.)

**2. Bubble's card cannot say "doesn't adapt to input" unqualified.** That is the
exact sentence CLAUDE.md was written about: true of *our* fixed-loop bubble sort,
false of bubble sort, and the false reading is the one a reader reaches. Every
other place on the page that states a bubble number carries "no early exit" beside
it. **Proposed: the card carries a variant line under the algorithm name, in the
same idiom the statistics table already uses for its row headers**
(`Bubble sort` / `no early exit`), and the finding then reads "Doesn't adapt to its
input — 120 comparisons every time." Quick's card gets the same line
(`last-element pivot`); insertion and merge get none, because they are the ordinary
versions and the table says so.

### The four cards

Structure, top to bottom: **algorithm name** → **variant, if ours is a variant** →
**the finding** → **`Try: <improvement>`**. The finding is the black text and the
`Try:` line is the blue one, reversing today's order, which puts the improvement
label second where it belongs.

| card | finding (proposed) | try |
| --- | --- | --- |
| Bubble sort <small>no early exit</small> | Doesn't adapt to its input — 120 comparisons every time. | Try: early exit |
| Insertion sort | Swings the widest of the four: cheapest on nearly-sorted, near-worst on nearly-reversed. | Try: binary search |
| Merge sort | Barely changes with the starting data: 46, 37, 37. | Try: skip ordered runs |
| Quick sort <small>last-element pivot</small> | Pivot choice decides everything — more work on nearly-sorted input than on random. | Try: random pivot |

Each is one sentence, each is checkable against the statistics table directly above
it, and none of them describes a fix. Clicking a card behaves exactly as it does
now: it loads the Improvements area, draws a fresh array, and runs the 20-array
comparison.

### Bars in their final sorted position — a design fork, measured

"Already in its final sorted position" can mean two different things, and the
measurement says they behave very differently. 400 runs per cell, counting how
often a bar takes the mark and then **loses** it again:

| | Random | Nearly sorted | Nearly reversed |
| --- | --- | --- | --- |
| bubble | 5.2 per run, 100% of runs | 1.0, 33% | 7.0, 100% |
| insertion | 5.1, 100% | 1.0, 36% | 7.1, 100% |
| merge | 2.6, 92% | 0.9, 33% | 1.0, 65% |
| quick | 0.9, 60% | 0.3, 11% | 0.3, 33% |

And on nearly-sorted input **7.3 of 16 bars sit in their final place before a
single comparison happens** (1.0 on random, 0.5 on nearly-reversed).

**Option A — "in its final place *right now*" (recommended).** A bar is marked when
its value equals the value the sorted array holds at that index. Algorithm-agnostic,
works identically in both races, needs no change to any generator, and is checkable
per frame in a test. Costs, stated plainly: a nearly-sorted race opens with about
half its bars already marked, and in every random or nearly-reversed run a bar or
five will take the colour and lose it again. That regression is not a bug — it is
bubble sort pushing a value back out of place, which is worth seeing — but the
label has to be honest about it, so the legend entry reads **"in its final place
(it can still move)"** rather than "sorted".

**Option B — "the algorithm is finished with it".** Mark only what an algorithm has
provably settled: bubble's growing tail after each pass, quick sort's placed
pivots. Never regresses, so the colour only ever grows. But insertion sort and
merge sort settle *nothing* until their last frame — a sorted prefix can still
receive a smaller value, and a merged run is still going to be merged again — so
two of the four cards would show no colour at all until the end. It also means
changing what every generator yields (a new `settled` field on `SortStep`), which
touches the frame contract Amendment 1 exists to protect.

**Option C — leave it.** The finished panel already goes green all at once.

Recommending **A**, with the honest legend. It is the only one that shows progress
in all four algorithms, and the flicker is information rather than noise.

**The colour, either way: the green already on the page** (`#16a34a`, what a
finished panel turns). Then "green = in its final place" is one rule, and the
whole-panel green at the end is a consequence of it rather than a second rule.
Precedence, unchanged in spirit: pivot violet beats compared amber beats in-place
green beats the default blue. The improvement race has no legend today, so it gets
the same three-swatch line the main race has — the colour is meaningless without
it, and "consistently in both races" has to include the key.

### The transposed improvement table

Today: one row per shape, columns Original and Improved. Proposed, matching the
main statistics table exactly — three shape columns, one row per variant:

```
                        Random    Nearly sorted   Nearly reversed
Original                 45.3          36.0            36.8
no early exit
Improved                 55.6          31.3            50.8
early exit             0/0/20        14/0/6          0/0/20
```

What this buys: the highlight now compares **down a column** like the main table's
does, the two variants are named in the row headers in the same `<small>` idiom the
main table uses for its algorithms, and the win/tied/lost triple appears once per
shape under the Improved cell instead of being a per-row afterthought. What it
costs: the DOM contract inverts, so `data-shape` moves from the rows to the cells
and headers, rows gain `data-variant="original" | "improved"`, and the per-row
`data-direction` becomes a per-column fact carried on the Improved cell. Six tests
from Amendments 6 and 7 read the old shape and get rewritten. The tolerance rule
and every number are untouched.

Risk to verify in the browser, not by reasoning: at 390px this becomes a
four-column table like the main one, so the count line has ~80px. Written as
`14/0/6` (no spaces, matching the main table's `15/20 won`) it should fit; if it
wraps or clips, the count moves into the caption's territory and I will say so
rather than shrink the type.

### The four headings, and the section split

| now | proposed |
| --- | --- |
| `h1` Sorting race | `h1` Sorting race |
| — (the race has no heading) | `h2` **Race** |
| `h2` Side A / `h2` Side B | `h3` Side A / `h3` Side B |
| `h2` Does the winner hold when the data changes? | `h2` **Statistics** |
| `h2` What we found *(contains the cards **and** the race)* | `h2` **What we found** *(cards only)* |
| `h3` *chosen card* — inside the findings section | `h2` **Improvements** → `h3` *chosen card* |

Three consequences worth approving explicitly:

1. **The improvement race becomes its own section**, so `id="improve"` moves onto
   it and the `#variant-detail` link ("the section below races the repairs") still
   resolves — checked by an existing test.
2. **The panel titles drop to `h3`**, which fixes the outline problem I flagged at
   the end of Amendment 7: "Side A" is currently a sibling of the section headings.
   It also lets the section headings take a larger size than the panel titles
   (proposed `h2` 1.35rem against `h3` 1.05rem), which is the type-scale change I
   said was yours to make. The four story steps then read by weight, not only by
   position.
3. **"Does the winner hold when the data changes?" is lost.** That heading was
   doing explanatory work; "Statistics" does not. The sentence under it — "One race
   is one array, and a lucky array flatters an algorithm." — already carries the
   question, so nothing true is lost, but the page gets slightly less pointed. Your
   call, and this is the cost.

### The remaining copy, cut

| block | now | proposed |
| --- | --- | --- |
| findings intro | 35 w | **0** — removed, per the brief |
| improvements intro | — | 18 w: "The same change can help on one starting shape and cost comparisons on another, so each fix races its own original on the identical arrays." |
| statistics caption | 68 w | 45 w: "20 arrays of each shape, 16 items each — the identical 20 to all four algorithms. Big number: average comparisons. Small number: how many of the 20 it used the fewest on, ties counting for each, so a column can top 20. Comparisons only: not time, not memory, and not a claim about longer arrays." |
| `#variant-detail` | 67 w | 38 w: "Two rows say more about our code than about the algorithms: our **bubble sort** has no early exit, so it makes the same 120 comparisons whatever the data, and our **quick sort** takes the last value as its pivot, which is why nearly-ordered data costs it more than random. Both are repaired below." |
| `improve-finding` line | 7–15 w | **0** — deleted; see below |
| comparison caption | 39 w | 24 w: "Small number: arrays the improvement won/tied/lost, out of 20. Averages under 2.5 comparisons apart are left unmarked." |
| four `expect` paragraphs | 77 w | unchanged — Amendment 7 already cut these to the one conclusion the race and table cannot show |

**Deleting the `improve-finding` line** is the one cut not implied by the brief, so
it is called out: the Improvements area currently repeats the chosen card's finding
underneath its own heading, and after this amendment the finding is the card's main
text, sitting selected and highlighted a few centimetres above. Repeating it was
worth it when the card's main text was the improvement label; it is duplication now.
Removing it deletes a `data-testid` two tests assert. Say no and it stays.

Every caveat that survives Amendment 7 survives this: identical arrays within a
column, ties inflating a column, comparisons-only, no extrapolation to longer
arrays, both variant confessions, the array length, and the ±2.5 tolerance.

Projected on-page total: **~245 words** of prose (from 452 after Amendment 7, 823
before it), plus the four cards' findings.

### Ambiguities, and how you settled them

1. **The in-place colour: A, B or C above.** → **A**, "in its final place right
   now", with the honest legend. Accepted knowing a nearly-sorted race opens about
   half green and that green bars visibly go blue again several times per run.
2. **"Remove the intro sentence" — remove, or move?** → **Move** one clause. The
   sentence leaves Findings; the caveat reappears as the 18-word line under
   Improvements.
3. **Merge's card wording**, given the measurement above. → **"Barely changes with
   the starting data: 46, 37, 37."** No superlative.
4. **Losing "Does the winner hold when the data changes?"** for the plain word
   "Statistics". → **Not accepted.** The heading still becomes `Statistics` as the
   brief asks, so the question moves into the sentence directly beneath it: *"Does
   the winner hold when the data changes? One race is one array, and a lucky array
   flatters an algorithm."* The heading is concise and the explanatory work is
   kept — this is a departure from the table above, where that row read
   "unchanged", and it is the only place this amendment adds a word rather than
   cutting one. Projected total moves 245 → 251 words.
5. **Deleting the duplicated finding line** in the Improvements area. → **Yes.**
   `improve-finding` and its two tests go.

### Machine-checked vs. judgement, this amendment

- **Machine-checked:** every card renders the finding before the `Try:` line, in
  that DOM order; bubble's and quick's cards carry their variant, and insertion's
  and merge's do not; a bar marked in-place holds exactly the value the sorted
  array holds at that index, asserted on every frame of every algorithm and shape,
  in both races; the final frame marks all sixteen; the transposed table has one
  row per variant and one column per shape, with `data-fewest` on at most one cell
  per column and none when the column's two averages are within the tolerance; the
  win/tied/lost triple still sums to 20 in every column; the four `h2`s are exactly
  Race, Statistics, What we found, Improvements, in that document order, with the
  panel titles below them as `h3`; `#improve` still resolves from
  `#variant-detail`; and every existing number, sample size and generator is
  unchanged (the whole existing suite must stay green).
- **Judgement, yours:** whether the cards now read as findings rather than as a
  menu of fixes; whether a green bar that later moves reads as informative or as a
  glitch; whether the transposed table is easier to read than the one it replaces
  or merely more consistent with the one above it; and whether "Race / Statistics /
  What we found / Improvements" reads as a story or as a filing system.
- **Explicitly unchanged:** all four algorithms and all four improvements, both
  input generators, the comparison metric, every sample size, the array length, the
  two registries, both speed sliders, the shape selector's scope, the ±2.5
  tolerance, and every number the page reports.

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
- **Machine-checked, added by Amendment 4:** the statistics table reports a cell
  for every algorithm × shape pair, so a column silently failing to render would
  fail rather than look like a narrower table; the fewest-comparisons highlight
  is per column, with exactly one column-winner per column; the ranking
  rearrangement itself, asserted as insertion beating merge in the Nearly sorted
  column and losing to it in the Nearly reversed column; the column headers match
  the shape list rather than being hand-written; and the Starting data selector no
  longer disturbs the table. Two tests written for Amendment 3 are deliberately
  rewritten here rather than deleted, because the contract they asserted (stats
  follow the selector; one row per algorithm) is the contract this amendment
  reverses — the reason is recorded in a comment at each.
- **Judgement only, added by Amendment 4:** whether twelve numbers in one table
  reads as *one comparison* or as a dense grid to be decoded; whether the
  compressed variant line by the controls is still enough for a reader who never
  scrolls to the table; and whether the matrix at 390px is legible rather than
  merely fitting.
- **Machine-checked, added by Amendment 5:** every frame of every *improved*
  variant is a permutation of the starting array, for every shape — pre-measured
  as 0 bad frames in 499,989 frames, so this is standing backpressure rather
  than a fix for a known bug — and each improved variant leaves the array
  sorted. The improved variants are absent from the main race's registry and
  from both dropdowns, which is the machine-checked form of "no improved variants
  in the main race". Four cards exist, one per algorithm; clicking one loads that
  algorithm into the single shared area, and clicking a second swaps it rather
  than adding a second area (asserted by counting areas). The area's controls are
  disabled until a card is chosen. Both sides of the improvement race receive an
  identical array, and its shape follows the Starting data selector. Plus the
  measured directions, each verified over 5000 samples of 20 arrays and each
  holding 5000/5000 with the smallest observed margin in brackets: bubble+early
  beats bubble on nearly sorted (27.15); insertion+binary beats insertion on
  random (20.05) and nearly reversed (62.10) and **loses** on nearly sorted
  (12.00); merge+skip beats merge on nearly sorted (1.20) and **loses** on random
  (7.80) and nearly reversed (13.45); quick+random beats quick on nearly sorted
  (29.35) and nearly reversed (23.45). Two further contracts needed a measured
  bound rather than an equality: bubble+early never uses *more* comparisons than
  bubble (0 in 400,000 arrays) and its nearly-reversed saving stays within 1
  comparison of zero (largest observed 0.20 over 20,000 samples of 20 — the tie
  is not exact, so asserting equality would have been a flake waiting to
  happen); and quick+random is non-deterministic, asserted as 12 races of one
  array yielding at least two distinct counts (12 identical never observed in
  6000 trials).
- **Judgement only, added by Amendment 5:** whether "improved" reads as a fair
  test rather than a victory lap, given two of the four improvements lose;
  whether the Insertion card's honest loss is understood as a trade rather than
  as a bug in the page; whether the random pivot's visible variance reads as "the
  data can no longer force a bad case" rather than "this code is flaky"; whether
  four cards plus a second race area still navigate at 390px; and whether the
  flow — choose a finding, then compare, then race — is discoverable without
  being told.
- **Machine-checked, added by Amendment 6:** every card renders a comparison with
  one row per shape and no shape missing (so a silently absent row fails rather
  than looking like a shorter table); each row's two counts come from the same
  array (asserted by running the comparison against a stubbed array source and
  checking both variants received identical inputs); wins + ties + losses sum to
  20 in every row; the table repopulates on a card change rather than keeping the
  previous card's numbers; the animated race still completes after a comparison
  has been run; and the Starting data selector leaves the table alone. Plus the
  measured directions, each to be re-verified at the asserted bound before the
  assertion is written — from 20,000 samples of 20 arrays, the bounds available
  are: insertion+binary's nearly-sorted average is worse by 11.7–19.5 (0–1 wins of
  20); merge+skip is worse by 7.5–11.3 on random and 13.3–14.7 on nearly reversed
  (0–1 and 0–0 wins); bubble+early is better by 26.3–77.5 on nearly sorted (16–20
  wins); insertion+binary is better by 62.1–69.8 on nearly reversed (20/20 wins);
  quick+random is better by 22.4–59.0 on nearly sorted and nearly reversed (15–20
  wins); and bubble+early on nearly reversed is within 0.3 of the original either
  way with 15–20 of 20 tied. Quick's random row is deliberately **not** asserted
  as a direction — 2–18 wins is the finding, and a test claiming otherwise would
  be the flake this list exists to prevent.
- **Judgement only, added by Amendment 6:** whether a reader connects the
  three-row table to the single race above it as *the same comparison at a larger
  sample* rather than as a second unrelated experiment; whether "0 of 20 · 20
  tied" reads as "inapplicable here" rather than "failed"; whether two speed
  sliders on one page read as local controls or as a contradiction; whether the
  Quick card's moving numbers read as honesty rather than instability; and whether
  the area at 390px still holds two stacked panels *plus* a four-column table
  within one reasonable scroll of the card that opened it.
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
