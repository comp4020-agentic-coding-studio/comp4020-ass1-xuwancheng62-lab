export type AlgorithmKey = "bubble" | "merge" | "quick";

export interface SortStep {
  array: number[];
  comparisons: number;
}

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
      yield { array: [...arr], comparisons };
    }
  }
  return { array: [...arr], comparisons };
}

function* mergeSort(input: number[]): SortGenerator {
  const arr = [...input];
  let comparisons = 0;

  function* mergeRange(lo: number, hi: number): Generator<void> {
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
      merged.push(left[i] <= right[j] ? left[i++] : right[j++]);
      commit();
      yield;
    }
    while (i < left.length) merged.push(left[i++]);
    while (j < right.length) merged.push(right[j++]);
    commit();
    yield;
  }

  for (const _ of mergeRange(0, arr.length)) {
    yield { array: [...arr], comparisons };
  }
  return { array: [...arr], comparisons };
}

function* quickSort(input: number[]): SortGenerator {
  const arr = [...input];
  let comparisons = 0;

  function* qs(lo: number, hi: number): Generator<void> {
    if (lo >= hi) return;
    const pivot = arr[hi];
    let store = lo;
    for (let i = lo; i < hi; i++) {
      comparisons++;
      if (arr[i] < pivot) {
        [arr[i], arr[store]] = [arr[store], arr[i]];
        store++;
      }
      yield;
    }
    [arr[store], arr[hi]] = [arr[hi], arr[store]];
    yield;
    yield* qs(lo, store - 1);
    yield* qs(store + 1, hi);
  }

  for (const _ of qs(0, arr.length - 1)) {
    yield { array: [...arr], comparisons };
  }
  return { array: [...arr], comparisons };
}

export const SORT_ALGORITHMS: Record<AlgorithmKey, (input: number[]) => SortGenerator> = {
  bubble: bubbleSort,
  merge: mergeSort,
  quick: quickSort,
};

export const ALGORITHM_LABELS: Record<AlgorithmKey, string> = {
  bubble: "Bubble sort",
  merge: "Merge sort",
  quick: "Quick sort",
};

export function shuffledRange(length: number): number[] {
  const values = Array.from({ length }, (_, i) => i + 1);
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}
