export type AlgorithmKey = "bubble" | "insertion" | "merge" | "quick";

export interface SortStep {
  array: number[];
  comparisons: number;
  /** Indices of the two values just compared, so the UI can show the decision. */
  compared?: readonly [number, number];
  /** Quick sort only: the index its current partition is measuring against. */
  pivot?: number;
}

/**
 * What a nested generator reports about one step. The recursive algorithms
 * (merge, quick) can't build a whole SortStep because they don't own the
 * comparison counter, so they yield just the marks and the outer generator
 * attaches the array and the count.
 */
type StepMark = Pick<SortStep, "compared" | "pivot">;

// Each algorithm is a generator: calling it doesn't sort anything yet, it
// hands back an iterator that runs one step (one comparison) per `.next()`
// call. That's what lets race.ts animate the sort with setTimeout instead of
// running it all at once.
export type SortGenerator = Generator<SortStep, SortStep, void>;

function* bubbleSort(input: number[]): SortGenerator {
  const arr = [...input];
  let comparisons = 0;
  for (let i = 0; i < arr.length - 1; i++) {
    for (let j = 0; j < arr.length - 1 - i; j++) {
      comparisons++;
      if (arr[j] > arr[j + 1]) {
        [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
      }
      // Always an adjacent pair: that crawl is bubble sort's whole strategy.
      yield { array: [...arr], comparisons, compared: [j, j + 1] };
    }
  }
  return { array: [...arr], comparisons };
}

function* insertionSort(input: number[]): SortGenerator {
  const arr = [...input];
  let comparisons = 0;
  for (let i = 1; i < arr.length; i++) {
    // Walks the new value down with adjacent swaps. The textbook version saves
    // the value to a variable and shifts the others right, which leaves its old
    // slot holding a copy -- a frame showing the same value twice, which is the
    // defect Amendment 1 fixed in merge sort. Swapping is permutation-safe at
    // every frame and makes exactly the same comparisons.
    for (let j = i - 1; j >= 0; j--) {
      comparisons++;
      const alreadyInPlace = arr[j] <= arr[j + 1];
      if (!alreadyInPlace) {
        [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
      }
      yield { array: [...arr], comparisons, compared: [j, j + 1] };
      // Stopping early is why insertion beats our bubble sort on comparisons.
      if (alreadyInPlace) break;
    }
  }
  return { array: [...arr], comparisons };
}

function* mergeSort(input: number[]): SortGenerator {
  const arr = [...input];
  let comparisons = 0;

  function* mergeRange(lo: number, hi: number): Generator<StepMark> {
    if (hi - lo <= 1) return;
    const mid = (lo + hi) >> 1;
    yield* mergeRange(lo, mid);
    yield* mergeRange(mid, hi);

    const left = arr.slice(lo, mid);
    const right = arr.slice(mid, hi);
    const merged: number[] = [];
    let i = 0;
    let j = 0;

    // Writing merged values straight back into `arr` would leave the region
    // holding a mix of new and stale values, so a frame could show the same
    // value twice -- an array the data is never in (PLAN.md Amendment 1).
    // Instead the region always reads as: what we've merged so far, then
    // whatever is left of each run. Those three parts are exactly the
    // original elements of the region, so every frame stays a permutation,
    // and you can watch the merged prefix grow as the two runs are consumed.
    function commit(): void {
      const view = [...merged, ...left.slice(i), ...right.slice(j)];
      for (let n = 0; n < view.length; n++) arr[lo + n] = view[n];
    }

    while (i < left.length && j < right.length) {
      comparisons++;
      const tookLeft = left[i] <= right[j];
      merged.push(tookLeft ? left[i++] : right[j++]);
      commit();
      // The winner is now the last element of the merged prefix; the value it
      // beat is still waiting at the head of its own run. Highlighting those
      // two shows merge sort choosing between the fronts of two sorted runs.
      const placed = lo + merged.length - 1;
      const beaten = tookLeft
        ? lo + merged.length + (left.length - i)
        : lo + merged.length;
      yield { compared: [placed, beaten] };
    }
    while (i < left.length) merged.push(left[i++]);
    while (j < right.length) merged.push(right[j++]);
    commit();
    // The tail flush compares nothing, so this frame carries no highlight.
    yield {};
  }

  for (const mark of mergeRange(0, arr.length)) {
    yield { array: [...arr], comparisons, ...mark };
  }
  return { array: [...arr], comparisons };
}

function* quickSort(input: number[]): SortGenerator {
  const arr = [...input];
  let comparisons = 0;

  function* qs(lo: number, hi: number): Generator<StepMark> {
    if (lo >= hi) return;
    const pivot = arr[hi];
    let store = lo;
    for (let i = lo; i < hi; i++) {
      comparisons++;
      // Every value in this partition is measured against the one pivot, so the
      // pivot stays marked while the scan sweeps past it -- the visible
      // opposite of bubble sort's local adjacent pair.
      let examined = i;
      if (arr[i] < pivot) {
        [arr[i], arr[store]] = [arr[store], arr[i]];
        examined = store;
        store++;
      }
      yield { compared: [examined, hi], pivot: hi };
    }
    [arr[store], arr[hi]] = [arr[hi], arr[store]];
    // The pivot has landed in its final position; nothing was compared here.
    yield { pivot: store };
    yield* qs(lo, store - 1);
    yield* qs(store + 1, hi);
  }

  for (const mark of qs(0, arr.length - 1)) {
    yield { array: [...arr], comparisons, ...mark };
  }
  return { array: [...arr], comparisons };
}

export const SORT_ALGORITHMS: Record<AlgorithmKey, (input: number[]) => SortGenerator> = {
  bubble: bubbleSort,
  insertion: insertionSort,
  merge: mergeSort,
  quick: quickSort,
};

/*
 * ---------------------------------------------------------------------------
 * The improved variants (PLAN.md Amendment 5).
 *
 * Each one repairs a weakness the statistics matrix exposed in the four above.
 * They are deliberately written out in full rather than sharing a parameterised
 * implementation with the originals: the originals produce every number in the
 * statistics matrix, and Amendment 5 promised them unchanged, so nothing here
 * is allowed to reach back into them. The cost is some repetition; the benefit
 * is that no edit down here can move a number up there.
 *
 * They live in their own registry below, never in SORT_ALGORITHMS, which is why
 * the main race cannot offer them: its dropdowns are built from that map.
 * ---------------------------------------------------------------------------
 */

/** Bubble sort that stops once a pass makes no swaps. */
function* bubbleSortEarlyExit(input: number[]): SortGenerator {
  const arr = [...input];
  let comparisons = 0;
  for (let i = 0; i < arr.length - 1; i++) {
    // The whole improvement is this flag: a pass that swaps nothing proves the
    // array is ordered, so every remaining pass would compare and change
    // nothing. The original has no way to notice and runs all of them.
    let swapped = false;
    for (let j = 0; j < arr.length - 1 - i; j++) {
      comparisons++;
      if (arr[j] > arr[j + 1]) {
        [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
        swapped = true;
      }
      yield { array: [...arr], comparisons, compared: [j, j + 1] };
    }
    if (!swapped) break;
  }
  return { array: [...arr], comparisons };
}

/** Insertion sort that binary-searches for the insertion point. */
function* binaryInsertionSort(input: number[]): SortGenerator {
  const arr = [...input];
  let comparisons = 0;
  for (let i = 1; i < arr.length; i++) {
    // Halve the sorted region instead of walking it. This is the only place on
    // the page where a comparison is between two *distant* values rather than
    // neighbours or a pivot -- the highlighted pair jumps around the sorted
    // prefix, which is what the binary search looks like.
    let lo = 0;
    let hi = i;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      comparisons++;
      const goesLeft = arr[i] < arr[mid];
      yield { array: [...arr], comparisons, compared: [i, mid] };
      if (goesLeft) hi = mid;
      else lo = mid + 1;
    }
    // Then move the value into the position the search found, by adjacent swaps
    // so every frame stays a permutation. These frames compare nothing, so the
    // counter holds still while the bars shuffle -- that gap between frames and
    // comparisons is the same one Amendment 2 settled for merge and quick.
    for (let j = i; j > lo; j--) {
      [arr[j], arr[j - 1]] = [arr[j - 1], arr[j]];
      yield { array: [...arr], comparisons, compared: [j - 1, j] };
    }
  }
  return { array: [...arr], comparisons };
}

/** Merge sort that skips a merge when the two runs are already in order. */
function* mergeSortSkipping(input: number[]): SortGenerator {
  const arr = [...input];
  let comparisons = 0;

  function* mergeRange(lo: number, hi: number): Generator<StepMark> {
    if (hi - lo <= 1) return;
    const mid = (lo + hi) >> 1;
    yield* mergeRange(lo, mid);
    yield* mergeRange(mid, hi);

    // Both halves are sorted now, so if the left one ends below where the right
    // one starts, the two are already in order end to end and the merge would
    // just copy them back unchanged. One comparison can prove that. It is also
    // charged when the answer is no, which is why this improvement can lose.
    comparisons++;
    const alreadyOrdered = arr[mid - 1] <= arr[mid];
    yield { compared: [mid - 1, mid] };
    if (alreadyOrdered) return;

    const left = arr.slice(lo, mid);
    const right = arr.slice(mid, hi);
    const merged: number[] = [];
    let i = 0;
    let j = 0;

    // Same permutation-safe view as the original merge sort (PLAN.md
    // Amendment 1): the region always reads as the merged prefix followed by
    // what is left of each run, so no frame can show a value twice.
    function commit(): void {
      const view = [...merged, ...left.slice(i), ...right.slice(j)];
      for (let n = 0; n < view.length; n++) arr[lo + n] = view[n];
    }

    while (i < left.length && j < right.length) {
      comparisons++;
      const tookLeft = left[i] <= right[j];
      merged.push(tookLeft ? left[i++] : right[j++]);
      commit();
      const placed = lo + merged.length - 1;
      const beaten = tookLeft ? lo + merged.length + (left.length - i) : lo + merged.length;
      yield { compared: [placed, beaten] };
    }
    while (i < left.length) merged.push(left[i++]);
    while (j < right.length) merged.push(right[j++]);
    commit();
    yield {};
  }

  for (const mark of mergeRange(0, arr.length)) {
    yield { array: [...arr], comparisons, ...mark };
  }
  return { array: [...arr], comparisons };
}

/** Quick sort that picks its pivot at random instead of taking the last value. */
function* quickSortRandomPivot(input: number[]): SortGenerator {
  const arr = [...input];
  let comparisons = 0;

  function* qs(lo: number, hi: number): Generator<StepMark> {
    if (lo >= hi) return;
    // Choosing at random costs no comparisons, and it is what stops the input
    // shape from deciding the pivot: an already-ordered array no longer hands
    // the original its worst case every time. The worst case still exists --
    // random can still pick badly -- it just stops being forced (Amendment 5).
    const choice = lo + Math.floor(Math.random() * (hi - lo + 1));
    if (choice !== hi) {
      [arr[choice], arr[hi]] = [arr[hi], arr[choice]];
      // A frame with a pivot mark and no compared pair: the pivot has been
      // chosen and moved, but nothing has been measured against it yet.
      yield { pivot: hi };
    }
    const pivot = arr[hi];
    let store = lo;
    for (let i = lo; i < hi; i++) {
      comparisons++;
      let examined = i;
      if (arr[i] < pivot) {
        [arr[i], arr[store]] = [arr[store], arr[i]];
        examined = store;
        store++;
      }
      yield { compared: [examined, hi], pivot: hi };
    }
    [arr[store], arr[hi]] = [arr[hi], arr[store]];
    yield { pivot: store };
    yield* qs(lo, store - 1);
    yield* qs(store + 1, hi);
  }

  for (const mark of qs(0, arr.length - 1)) {
    yield { array: [...arr], comparisons, ...mark };
  }
  return { array: [...arr], comparisons };
}

/**
 * One improvement per algorithm, keyed by the same names. Deliberately a
 * separate map from SORT_ALGORITHMS: the main race builds its dropdowns from
 * that one, so an improved variant cannot appear there by accident.
 */
export const IMPROVED_ALGORITHMS: Record<AlgorithmKey, (input: number[]) => SortGenerator> = {
  bubble: bubbleSortEarlyExit,
  insertion: binaryInsertionSort,
  merge: mergeSortSkipping,
  quick: quickSortRandomPivot,
};

/**
 * The fewest comparisons any comparison sort can need for `length` distinct
 * items: ceil(log2(length!)). Computed rather than written down, because it is
 * the one number on the page that is a mathematical fact instead of a
 * measurement, and it explains why merge sort has almost nothing left to win.
 */
export function comparisonFloor(length: number): number {
  let bits = 0;
  for (let k = 2; k <= length; k++) bits += Math.log2(k);
  return Math.ceil(bits);
}

export interface Improvement {
  /** Short name for the change, shown next to the algorithm's name. */
  label: string;
  /** What the statistics matrix showed, which is what makes this worth trying. */
  finding: string;
  /** What the improved code does differently. */
  change: string;
  /**
   * The one conclusion the race and the table cannot show for themselves -- a
   * guarantee, a trade, or a limit -- in a sentence (PLAN.md Amendment 7).
   * Anything the numbers below it already say has been cut. A function of array
   * length because merge's honest answer needs the comparison floor for that
   * length, and every number a reader sees is computed in their browser, never
   * typed into the source where it could drift from what the code does.
   */
  expect: (length: number) => string;
}

/**
 * The four findings, each pairing a weakness the matrix exposed with the
 * improvement that targets it. Two of the four make things worse on some input
 * shapes, and say so here: that is the argument of the section, not a caveat on
 * it (PLAN.md Amendment 5).
 */
export const IMPROVEMENTS: Record<AlgorithmKey, Improvement> = {
  bubble: {
    label: "early exit",
    finding: "Never responds to its data — the same average in all three columns.",
    change: "Stop as soon as a pass makes no swaps, which proves the array is already in order.",
    expect: () =>
      "Never costs more than the original, but a value still moves only one place per pass, so nearly-reversed input saves nothing.",
  },
  insertion: {
    label: "binary search",
    finding: "The widest swing on the page: best on nearly-sorted, nearly the worst on nearly-reversed.",
    change: "Binary-search the sorted part for the right position instead of walking down to it.",
    expect: () =>
      "Trades the early break that won nearly-sorted input for a near-constant cost on any input.",
  },
  merge: {
    label: "skip ordered runs",
    finding: "The steadiest and least adaptive: barely notices random from nearly-sorted.",
    change:
      "Before merging two sorted runs, spend one comparison asking whether they are already in order end to end, and skip the merge when they are.",
    expect: (length) =>
      `Little room to win: no comparison sort can beat ${comparisonFloor(length)} comparisons for ${length} items, and merge sort is already close.`,
  },
  quick: {
    label: "random pivot",
    finding: "Worse on nearly-sorted input than on random, which is backwards.",
    change: "Pick the pivot at random, so the position of a value in the input no longer decides it.",
    expect: () =>
      "Improves the expected case, not the worst: a random pivot can still split badly, but no starting shape can force it.",
  },
};

export const ALGORITHM_LABELS: Record<AlgorithmKey, string> = {
  bubble: "Bubble sort",
  insertion: "Insertion sort",
  merge: "Merge sort",
  quick: "Quick sort",
};

/**
 * Which variant of each algorithm this page implements, where the choice
 * changes the numbers. Bubble's fixed loops are why it reports the same 120
 * comparisons on every input shape, and Quick's last-element pivot is why it
 * gets *worse* on nearly-ordered data -- both are properties of these
 * implementations, not of the algorithms, so the label travels with the number
 * (PLAN.md Amendment 3). Empty string means "the ordinary textbook version".
 */
export const ALGORITHM_VARIANTS: Record<AlgorithmKey, string> = {
  bubble: "basic fixed loops, no early exit",
  insertion: "",
  merge: "",
  quick: "last-element pivot",
};

export interface AlgorithmStats {
  algorithm: AlgorithmKey;
  averageComparisons: number;
  /** Runs where this algorithm used the fewest comparisons; ties count for all. */
  fewestWins: number;
}

/**
 * Total comparisons for one algorithm on one input, by running the same
 * generator the animation uses so there is one definition of "a comparison".
 */
export function countComparisons(algorithm: AlgorithmKey, input: number[]): number {
  return countVariantComparisons(SORT_ALGORITHMS[algorithm], input);
}

/**
 * The same count for any sort generator, so an improved variant is measured by
 * the identical definition of "a comparison" as the original it is raced
 * against -- including the bookkeeping the improvement itself spends (a skip
 * test, a pivot swap). Excluding that would rig the race it appears in.
 */
export function countVariantComparisons(
  sort: (input: number[]) => SortGenerator,
  input: number[],
): number {
  const generator = sort(input);
  let result = generator.next();
  while (!result.done) result = generator.next();
  return result.value.comparisons;
}

/**
 * Comparison counts for every algorithm across a shared set of inputs. Takes the
 * inputs rather than generating them so this is deterministic under test, and so
 * every algorithm provably sees the identical arrays.
 */
export function comparisonStats(inputs: number[][]): AlgorithmStats[] {
  const keys = Object.keys(SORT_ALGORITHMS) as AlgorithmKey[];
  const totals = new Map<AlgorithmKey, number>(keys.map((key) => [key, 0]));
  const wins = new Map<AlgorithmKey, number>(keys.map((key) => [key, 0]));

  for (const input of inputs) {
    const counts = keys.map((key) => ({ key, count: countComparisons(key, input) }));
    const fewest = Math.min(...counts.map((entry) => entry.count));
    for (const { key, count } of counts) {
      totals.set(key, totals.get(key)! + count);
      if (count === fewest) wins.set(key, wins.get(key)! + 1);
    }
  }

  return keys.map((algorithm) => ({
    algorithm,
    averageComparisons: inputs.length === 0 ? 0 : totals.get(algorithm)! / inputs.length,
    fewestWins: wins.get(algorithm)!,
  }));
}

/**
 * How far apart two 20-array averages have to be before the page marks one of
 * them as fewer (PLAN.md Amendment 7). Measured, not guessed: over 4,000 samples
 * of 20 arrays, quick sort's random pivot -- which genuinely costs nothing on
 * random input, mean difference -0.04 -- still spread from -5.2 to +5.3, while
 * ten of the twelve algorithm/shape cells sit 8 to 67 comparisons from zero.
 * 2.5 leaves 73% of those noise draws unmarked and is nowhere near the ten real
 * effects. It cannot separate noise from merge sort's genuine 4.8-comparison
 * saving on nearly-sorted input, and it is deliberately too narrow to try: a
 * band wide enough for that would erase a real finding in most draws.
 */
export const AVERAGE_TOLERANCE = 2.5;

/**
 * Which of two averages to mark, or neither. Pure and exported so the tolerance
 * is asserted on constructed numbers rather than on a sample that could make the
 * test flake.
 */
export function averageDirection(
  originalAverage: number,
  improvedAverage: number,
): "better" | "same" | "worse" {
  if (Math.abs(improvedAverage - originalAverage) < AVERAGE_TOLERANCE) return "same";
  return improvedAverage < originalAverage ? "better" : "worse";
}

export interface ImprovementComparison {
  originalAverage: number;
  improvedAverage: number;
  /** Arrays where the improved variant used strictly fewer comparisons. */
  improvedWins: number;
  /** Arrays where the two used exactly the same number. Neither side's. */
  ties: number;
  improvedLosses: number;
}

/**
 * One improvement measured against its own original over a set of arrays
 * (PLAN.md Amendment 6). Never against another algorithm: the pair is fixed by
 * the key, so a card cannot end up comparing bubble's fix to quick sort.
 *
 * Takes the inputs rather than generating them, for the same two reasons
 * comparisonStats does: it is deterministic under test, and both variants
 * provably see the identical arrays -- there is one `input` here and both counts
 * read it, so fairness is a property of the loop rather than a promise in a
 * caption. Both generators copy their input before touching it, so neither can
 * hand the other a modified array.
 */
export function improvementComparison(
  algorithm: AlgorithmKey,
  inputs: number[][],
): ImprovementComparison {
  let originalTotal = 0;
  let improvedTotal = 0;
  let improvedWins = 0;
  let ties = 0;
  let improvedLosses = 0;

  for (const input of inputs) {
    const original = countVariantComparisons(SORT_ALGORITHMS[algorithm], input);
    const improved = countVariantComparisons(IMPROVED_ALGORITHMS[algorithm], input);
    originalTotal += original;
    improvedTotal += improved;
    if (improved < original) improvedWins++;
    else if (improved === original) ties++;
    else improvedLosses++;
  }

  const runs = inputs.length;
  return {
    originalAverage: runs === 0 ? 0 : originalTotal / runs,
    improvedAverage: runs === 0 ? 0 : improvedTotal / runs,
    improvedWins,
    ties,
    improvedLosses,
  };
}

export function shuffledRange(length: number): number[] {
  const values = Array.from({ length }, (_, i) => i + 1);
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}

export type ShapeKey = "random" | "nearlySorted" | "nearlyReversed";

export const SHAPE_LABELS: Record<ShapeKey, string> = {
  random: "Random",
  nearlySorted: "Nearly sorted",
  nearlyReversed: "Nearly reversed",
};

/** How many values the two "nearly" shapes knock out of place. */
const DISPLACEMENTS = 2;

/**
 * Takes a fully ordered array and pulls `moves` values out, dropping each back
 * in at a random position. Two bases give the symmetric pair: ascending makes
 * "nearly sorted", descending makes "nearly reversed" (PLAN.md Amendment 3).
 *
 * Measured against three alternatives before choosing it. Swapping *adjacent*
 * pairs instead leaves the array looking identical to sorted, and lands back on
 * exactly sorted 6% of the time; three random swaps drifts so close to random
 * that insertion sort stops reliably winning. Displacing two values is visibly
 * disordered without being random, and is describable in one sentence.
 *
 * The loop rejects a result that lands back on the untouched base, so a "nearly
 * sorted" array is never actually sorted -- which would read as a bug.
 */
function displaced(base: number[], moves: number): number[] {
  let values: number[];
  do {
    values = [...base];
    for (let move = 0; move < moves; move++) {
      const [value] = values.splice(Math.floor(Math.random() * values.length), 1);
      values.splice(Math.floor(Math.random() * (values.length + 1)), 0, value);
    }
  } while (values.every((value, index) => value === base[index]));
  return values;
}

/**
 * The three starting conditions. One shape is selected on the page and drives
 * both the race and the statistics run, so the two always describe the same
 * experiment.
 */
export const INPUT_SHAPES: Record<ShapeKey, (length: number) => number[]> = {
  random: (length) => shuffledRange(length),
  nearlySorted: (length) =>
    displaced(
      Array.from({ length }, (_, i) => i + 1),
      DISPLACEMENTS,
    ),
  nearlyReversed: (length) =>
    displaced(
      Array.from({ length }, (_, i) => length - i),
      DISPLACEMENTS,
    ),
};

/**
 * A sample of distinct arrays of one shape, for the statistics run. Distinct
 * because an unguarded 20-draw of a "nearly" shape repeats itself about 3% of
 * the time, and the table promises 20 different inputs. There are 22066 arrays
 * reachable by two displacements, so rejecting duplicates costs about 0.04
 * extra draws per sample and cannot exhaust the space.
 */
export function shapeSample(shape: ShapeKey, length: number, count: number): number[][] {
  const seen = new Set<string>();
  const inputs: number[][] = [];
  while (inputs.length < count) {
    const candidate = INPUT_SHAPES[shape](length);
    const key = candidate.join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    inputs.push(candidate);
  }
  return inputs;
}
