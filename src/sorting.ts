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

export const ALGORITHM_LABELS: Record<AlgorithmKey, string> = {
  bubble: "Bubble sort",
  insertion: "Insertion sort",
  merge: "Merge sort",
  quick: "Quick sort",
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
  const generator = SORT_ALGORITHMS[algorithm](input);
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

export function shuffledRange(length: number): number[] {
  const values = Array.from({ length }, (_, i) => i + 1);
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}
