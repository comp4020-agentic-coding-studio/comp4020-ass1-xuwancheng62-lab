import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import { initRace } from "../src/race";
import {
  ALGORITHM_VARIANTS,
  AVERAGE_TOLERANCE,
  IMPROVED_ALGORITHMS,
  IMPROVEMENTS,
  INPUT_SHAPES,
  SHAPE_LABELS,
  SORT_ALGORITHMS,
  averageDirection,
  comparisonStats,
  countComparisons,
  countVariantComparisons,
  improvementComparison,
  shapeSample,
  shuffledRange,
  type AlgorithmKey,
  type ShapeKey,
} from "../src/sorting";

const SHAPE_KEYS = Object.keys(INPUT_SHAPES) as ShapeKey[];

/** Pairs out of order — the measurable form of "nearly sorted". */
function inversions(values: number[]): number {
  let count = 0;
  for (let i = 0; i < values.length; i++) {
    for (let j = i + 1; j < values.length; j++) if (values[i] > values[j]) count++;
  }
  return count;
}

// The week's spec: "the visitor does something that changes what they see —
// state the core interaction plainly enough to write a test for it." The
// interaction is the race (see PLAN.md): pressing Race runs both panels
// against the same shuffled array, and each panel ends sorted with a
// non-zero, frozen comparison count.

const PANEL_MARKUP = (id: string) => `
  <section data-testid="panel-${id}">
    <select data-testid="algorithm-select-${id}"></select>
    <div data-testid="bars-${id}"></div>
    <output data-testid="counter-${id}">0</output>
  </section>
`;

// Amendment 5: the improvement race's markup. Kept in the fixture so these
// tests stay about behaviour, with "the real index.html carries all of it" as a
// separate test against the file itself -- otherwise the fixture could drift
// into being the only page the suite has ever seen work.
const IMPROVE_MARKUP = `
  <ol data-testid="finding-cards"></ol>
  <section data-testid="improve-area">
    <span data-testid="improve-title"></span>
    <p data-testid="improve-change"></p>
    <button type="button" data-testid="improve-shuffle" disabled></button>
    <button type="button" data-testid="improve-race" disabled></button>
    <select data-testid="improve-shape-select" disabled></select>
    <section data-testid="improve-panel-original">
      <small data-testid="improve-variant-original"></small>
      <div data-testid="improve-bars-original"></div>
      <output data-testid="improve-counter-original">0</output>
    </section>
    <section data-testid="improve-panel-improved">
      <small data-testid="improve-variant-improved"></small>
      <div data-testid="improve-bars-improved"></div>
      <output data-testid="improve-counter-improved">0</output>
    </section>
    <p data-testid="improve-expect"></p>
    <input type="range" min="2" max="50" value="10" data-testid="improve-speed" />
    <button type="button" class="rerun" data-testid="improve-rerun" disabled></button>
    <table data-testid="improve-stats">
      <caption><span data-testid="improve-stats-scope"></span></caption>
      <thead data-testid="improve-stats-head"></thead>
      <tbody data-testid="improve-stats-body"></tbody>
    </table>
  </section>
`;

const RACE_HTML = `<!doctype html><body>
  <button type="button" data-testid="shuffle-button"></button>
  <button type="button" data-testid="race-button"></button>
  <input type="range" min="2" max="50" value="10" data-testid="speed-slider" />
  <select data-testid="shape-select"></select>
  ${PANEL_MARKUP("a")}
  ${PANEL_MARKUP("b")}
  <button type="button" data-testid="stats-button"></button>
  <table>
    <caption><span data-testid="stats-scope"></span></caption>
    <thead data-testid="stats-head"></thead>
    <tbody data-testid="stats-body"></tbody>
  </table>
  ${IMPROVE_MARKUP}
</body>`;

// Amendment 3 parameterises these by starting shape. Every algorithm is now
// checked against every condition the page can put it in, rather than against
// random shuffles only: a frame defect that only appears on ordered input --
// exactly the kind of input that makes runs collapse into each other -- would
// otherwise never be exercised by the suite.
for (const shape of SHAPE_KEYS) {
  describe(`each sort algorithm, on ${shape} input`, () => {
    for (const [key, algorithm] of Object.entries(SORT_ALGORITHMS)) {
      it(`${key}: sorts the array and counts at least one comparison`, () => {
        const input = INPUT_SHAPES[shape](16);
        const generator = algorithm(input);
        let result = generator.next();
        while (!result.done) result = generator.next();

        expect(result.value.comparisons).toBeGreaterThan(0);
        for (let i = 1; i < result.value.array.length; i++) {
          expect(result.value.array[i]).toBeGreaterThanOrEqual(result.value.array[i - 1]);
        }
      });

      // PLAN.md Amendment 1: the intermediate frames ARE the explanation, so a
      // frame the data could never be in is a wrong answer even when the final
      // array is sorted. Merge Sort used to write merged values into the live
      // array while its source copies still held the originals, so mid-merge
      // frames showed the same bar height twice.
      it(`${key}: every intermediate frame is a permutation of the input`, () => {
        const input = INPUT_SHAPES[shape](16);
        const expected = [...input].sort((a, b) => a - b);
        const generator = algorithm(input);

        let frame = 0;
        let result = generator.next();
        while (true) {
          const actual = [...result.value.array].sort((a, b) => a - b);
          expect(
            actual,
            `${key} frame ${frame} on ${shape} input is not a permutation: [${result.value.array.join(", ")}]`,
          ).toEqual(expected);
          if (result.done) break;
          frame++;
          result = generator.next();
        }

        expect(frame, `${key} yielded no intermediate frames`).toBeGreaterThan(0);
      });

      // PLAN.md Amendment 1 item 4: the highlight is the explanation, so an
      // out-of-range index would silently mark nothing (or the wrong bar) while
      // every other check stayed green.
      it(`${key}: reports in-range compared/pivot indices, and marks most frames`, () => {
        const input = INPUT_SHAPES[shape](16);
        const generator = algorithm(input);

        let frames = 0;
        let marked = 0;
        let sawPivot = false;
        let result = generator.next();
        while (!result.done) {
          frames++;
          const { compared, pivot } = result.value;
          if (compared) {
            marked++;
            expect(compared, `${key} compared two identical indices`).not.toEqual([
              compared[1],
              compared[1],
            ]);
            for (const index of compared) {
              expect(index, `${key} compared index out of range`).toBeGreaterThanOrEqual(0);
              expect(index, `${key} compared index out of range`).toBeLessThan(input.length);
            }
          }
          if (pivot !== undefined) {
            sawPivot = true;
            expect(pivot, `${key} pivot index out of range`).toBeGreaterThanOrEqual(0);
            expect(pivot, `${key} pivot index out of range`).toBeLessThan(input.length);
          }
          result = generator.next();
        }

        // Most frames should say what was compared, or there is nothing to watch.
        expect(
          marked / frames,
          `${key} marked only ${marked} of ${frames} frames on ${shape} input`,
        ).toBeGreaterThan(0.5);
        expect(sawPivot, `${key} pivot reporting`).toBe(key === "quick");
      });
    }
  });
}

describe("the three starting shapes", () => {
  for (const shape of SHAPE_KEYS) {
    it(`${shape}: is a permutation of 1..16, so no shape can smuggle in a duplicate`, () => {
      for (let trial = 0; trial < 50; trial++) {
        const values = [...INPUT_SHAPES[shape](16)].sort((a, b) => a - b);
        expect(values).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
      }
    });
  }

  // "Nearly" is a claim about disorder, so it gets measured as disorder. The
  // thresholds are deliberately well outside the observed ranges (nearly-sorted
  // reached at most 27 inversions over 5000 arrays, nearly-reversed at least
  // 92) because these are random draws and a tight bound would fail eventually.
  // They are NOT compared against a random array's inversion count: measured
  // over 5000 draws each, nearly-sorted reaches 27 and random dips to 23, so
  // that comparison would be flaky by construction.
  it("nearly-sorted is measurably ordered and nearly-reversed measurably reversed", () => {
    for (let trial = 0; trial < 50; trial++) {
      expect(inversions(INPUT_SHAPES.nearlySorted(16))).toBeLessThanOrEqual(40);
      expect(inversions(INPUT_SHAPES.nearlyReversed(16))).toBeGreaterThanOrEqual(80);
    }
  });

  it("never hands back the untouched base — a 'nearly sorted' array is never sorted", () => {
    const ascending = Array.from({ length: 16 }, (_, i) => i + 1);
    const descending = [...ascending].reverse();
    for (let trial = 0; trial < 200; trial++) {
      expect(INPUT_SHAPES.nearlySorted(16)).not.toEqual(ascending);
      expect(INPUT_SHAPES.nearlyReversed(16)).not.toEqual(descending);
    }
  });

  for (const shape of SHAPE_KEYS) {
    it(`${shape}: a 20-array sample holds 20 distinct arrays`, () => {
      const sample = shapeSample(shape, 16, 20);
      expect(sample).toHaveLength(20);
      expect(new Set(sample.map((values) => values.join(","))).size).toBe(20);
    });
  }
});

describe("the race", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // The whole comparison rests on this: two algorithms racing on different
  // arrays would be measuring the arrays, not the algorithms. Amendment 3 makes
  // it easier to get wrong, because the shape select is a second place a fresh
  // array can be generated.
  it("hands both panels the exact same starting array, for every shape", () => {
    const dom = new JSDOM(RACE_HTML);
    const { document } = dom.window;
    initRace(document);

    const barValues = (id: string) =>
      [...document.querySelectorAll(`[data-testid="bars-${id}"] .bar`)].map((bar) =>
        Number((bar as HTMLElement).dataset.value),
      );
    const shapeSelect = document.querySelector('[data-testid="shape-select"]') as HTMLSelectElement;

    for (const shape of SHAPE_KEYS) {
      shapeSelect.value = shape;
      shapeSelect.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
      for (let press = 0; press < 5; press++) {
        document
          .querySelector('[data-testid="shuffle-button"]')!
          .dispatchEvent(new dom.window.Event("click", { bubbles: true }));
        expect(barValues("a").length, `no bars drawn for ${shape}`).toBe(16);
        expect(barValues("a"), `panels differ on ${shape} input`).toEqual(barValues("b"));
      }
    }
  });

  // DELIBERATELY REWRITTEN for Amendment 4, not deleted. Under Amendment 3 this
  // asserted the opposite half: that the selector drove the statistics too, and
  // that changing it cleared the table. The IA correction makes the selector the
  // race's condition alone -- the table now shows all three shapes at once, so
  // there is no stale-caption mismatch left to clear. What survives unchanged is
  // the half that was always right: the selector must reach the race.
  it("sends the selected shape to the race, and leaves the statistics alone", () => {
    const dom = new JSDOM(RACE_HTML);
    const { document } = dom.window;
    initRace(document);

    const shapeSelect = document.querySelector('[data-testid="shape-select"]') as HTMLSelectElement;
    expect(
      [...shapeSelect.options].map((option) => option.value).sort(),
      "shape select is not populated with every shape",
    ).toEqual([...SHAPE_KEYS].sort());

    document
      .querySelector('[data-testid="stats-button"]')!
      .dispatchEvent(new dom.window.Event("click", { bubbles: true }));
    const before = document.querySelector('[data-testid="stats-body"]')!.innerHTML;
    expect(before.length, "statistics did not render").toBeGreaterThan(0);

    shapeSelect.value = "nearlySorted";
    shapeSelect.dispatchEvent(new dom.window.Event("change", { bubbles: true }));

    expect(
      document.querySelector('[data-testid="stats-body"]')!.innerHTML,
      "changing the shape disturbed the statistics, which now cover all three shapes",
    ).toBe(before);

    // The race did get the new shape: a nearly-sorted array of 16 is measurably
    // ordered where a random one is not.
    const bars = [...document.querySelectorAll('[data-testid="bars-a"] .bar')].map((bar) =>
      Number((bar as HTMLElement).dataset.value),
    );
    expect(inversions(bars), `race array was not nearly sorted: ${bars.join(", ")}`).toBeLessThanOrEqual(40);
  });

  it("ends both panels sorted, each with a non-zero comparison count that then stops changing", () => {
    const dom = new JSDOM(RACE_HTML);
    const { document } = dom.window;
    initRace(document);

    const raceButton = document.querySelector('[data-testid="race-button"]');
    expect(raceButton, "race button not found in test markup").toBeTruthy();
    raceButton!.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
    vi.runAllTimers();

    for (const id of ["a", "b"]) {
      const panel = document.querySelector(`[data-testid="panel-${id}"]`) as HTMLElement;
      expect(panel.dataset.sorted, `panel ${id} never reported sorted`).toBe("true");

      const values = [...panel.querySelectorAll(`[data-testid="bars-${id}"] .bar`)].map((bar) =>
        Number((bar as HTMLElement).dataset.value),
      );
      expect(values.length, `panel ${id} has no bars`).toBeGreaterThan(0);
      for (let i = 1; i < values.length; i++) {
        expect(values[i], `panel ${id} bars out of order: ${values.join(", ")}`).toBeGreaterThanOrEqual(
          values[i - 1],
        );
      }

      const counterBefore = document.querySelector(`[data-testid="counter-${id}"]`)!.textContent;
      expect(Number(counterBefore), `panel ${id} comparison count never moved`).toBeGreaterThan(0);

      vi.runAllTimers();
      const counterAfter = document.querySelector(`[data-testid="counter-${id}"]`)!.textContent;
      expect(counterAfter, `panel ${id} comparison count kept changing after sorted`).toBe(counterBefore);
    }
  });

  // PLAN.md Amendment 2: the border used to mark whoever finished animating
  // first, which disagreed with the comparison counts it sits above on about a
  // fifth of merge-vs-quick races. The panels report comparisons, so the border
  // has to mean the same thing.
  it("gives the winner border to the panel with fewer comparisons, not the one that finishes first", () => {
    const dom = new JSDOM(RACE_HTML);
    const { document } = dom.window;
    initRace(document);

    document
      .querySelector('[data-testid="race-button"]')!
      .dispatchEvent(new dom.window.Event("click", { bubbles: true }));
    vi.runAllTimers();

    const counts = ["a", "b"].map((id) =>
      Number(document.querySelector(`[data-testid="counter-${id}"]`)!.textContent),
    );
    const fewest = Math.min(...counts);

    for (const [index, id] of ["a", "b"].entries()) {
      const panel = document.querySelector(`[data-testid="panel-${id}"]`) as HTMLElement;
      const shouldWin = counts[index] === fewest;
      expect(
        panel.dataset.winner === "true",
        `panel ${id} made ${counts[index]} comparisons (fewest was ${fewest})`,
      ).toBe(shouldWin);
    }
  });

  // The slider is only useful if it takes effect on a race already running,
  // which is why race.ts reads it when scheduling each frame instead of
  // capturing it at the start. A race that stalled after the change would still
  // leave the panels unsorted here.
  it("finishes the race when the speed slider is moved mid-race", () => {
    const dom = new JSDOM(RACE_HTML);
    const { document } = dom.window;
    initRace(document);

    const slider = document.querySelector('[data-testid="speed-slider"]') as HTMLInputElement;
    slider.value = "2";
    document
      .querySelector('[data-testid="race-button"]')!
      .dispatchEvent(new dom.window.Event("click", { bubbles: true }));

    vi.advanceTimersByTime(1200);
    const partway = Number(document.querySelector('[data-testid="counter-a"]')!.textContent);
    expect(partway, "race had not started before the slider moved").toBeGreaterThan(0);
    const panelA = document.querySelector('[data-testid="panel-a"]') as HTMLElement;
    expect(panelA.dataset.sorted, "race finished before the slider could move").toBeUndefined();

    slider.value = "50";
    vi.runAllTimers();

    for (const id of ["a", "b"]) {
      const panel = document.querySelector(`[data-testid="panel-${id}"]`) as HTMLElement;
      expect(panel.dataset.sorted, `panel ${id} never finished after the speed changed`).toBe("true");
    }
  });

  // DELIBERATELY REWRITTEN for Amendment 4, not deleted. This used to assert one
  // row per algorithm with a single average each -- the table it described showed
  // one shape at a time. The contract is now a matrix: every algorithm x shape
  // pair gets a cell, so a column that silently failed to render would fail here
  // rather than merely look like a narrower table.
  it("fills the statistics table with a cell for every algorithm and every shape", () => {
    const dom = new JSDOM(RACE_HTML);
    const { document } = dom.window;
    initRace(document);

    document
      .querySelector('[data-testid="stats-button"]')!
      .dispatchEvent(new dom.window.Event("click", { bubbles: true }));

    const rows = [...document.querySelectorAll('[data-testid="stats-body"] tr')];
    expect(rows.length, "one row per algorithm").toBe(Object.keys(SORT_ALGORITHMS).length);

    // The header is generated from the shape list, so it cannot drift out of step
    // with the columns of data underneath it.
    const headers = [...document.querySelectorAll('[data-testid="stats-head"] th[data-shape]')].map(
      (th) => (th as HTMLElement).dataset.shape,
    );
    expect(headers, "column headers do not match the shape list").toEqual(SHAPE_KEYS);

    for (const key of Object.keys(SORT_ALGORITHMS)) {
      for (const shape of SHAPE_KEYS) {
        const cell = document.querySelector(`[data-testid="stats-cell-${key}-${shape}"]`);
        expect(cell, `no cell for ${key} on ${shape}`).toBeTruthy();
        const average = Number(cell!.querySelector(".avg")!.textContent);
        expect(average, `${key}/${shape} average outside what a 16-item sort can do`).toBeGreaterThanOrEqual(15);
        expect(average, `${key}/${shape} average outside what a 16-item sort can do`).toBeLessThanOrEqual(120);
        expect(cell!.querySelector("small")!.textContent, `${key}/${shape} win count missing`).toMatch(
          /^\d+\/20 won$/,
        );
      }
    }
  });

  // The highlight has to be per column, because "fewest" is only meaningful
  // within one condition. Highlighting one cell of twelve would assert a single
  // overall winner, which is the claim this whole iteration disproves.
  it("marks the fewest-comparison cell once per shape, not once per table", () => {
    const dom = new JSDOM(RACE_HTML);
    const { document } = dom.window;
    initRace(document);

    document
      .querySelector('[data-testid="stats-button"]')!
      .dispatchEvent(new dom.window.Event("click", { bubbles: true }));

    for (const [column, shape] of SHAPE_KEYS.entries()) {
      const cells = [...document.querySelectorAll('[data-testid="stats-body"] tr')].map(
        (tr) => tr.querySelectorAll("td")[column] as HTMLElement,
      );
      const averages = cells.map((cell) => Number(cell.querySelector(".avg")!.textContent));
      const fewest = Math.min(...averages);
      const marked = cells.filter((cell) => cell.dataset.fewest === "true");

      expect(marked.length, `${shape} column marked ${marked.length} cells`).toBe(1);
      expect(
        Number(marked[0].querySelector(".avg")!.textContent),
        `${shape} column highlighted a cell that is not the lowest (${averages.join(", ")})`,
      ).toBe(fewest);
    }
  });

  // Amendment 4's whole purpose, asserted on the rendered table rather than on
  // the module: the two nearly-shapes must disagree about who wins, and they must
  // disagree in one press without the reader switching anything. Only these two
  // columns are asserted -- see the module-level test below for why Random's
  // winner is deliberately left unasserted.
  it("shows the ranking rearranging between columns in a single run", () => {
    const dom = new JSDOM(RACE_HTML);
    const { document } = dom.window;
    initRace(document);

    document
      .querySelector('[data-testid="stats-button"]')!
      .dispatchEvent(new dom.window.Event("click", { bubbles: true }));

    const winnerOf = (shape: ShapeKey) =>
      [...document.querySelectorAll('[data-testid="stats-body"] tr')].find(
        (tr) =>
          (tr.querySelector(`[data-testid$="-${shape}"]`) as HTMLElement | null)?.dataset.fewest === "true",
      )?.getAttribute("data-algorithm");

    expect(winnerOf("nearlySorted"), "nearly-sorted column should be won by insertion sort").toBe(
      "insertion",
    );
    expect(winnerOf("nearlyReversed"), "nearly-reversed column should be won by merge sort").toBe(
      "merge",
    );
    expect(
      winnerOf("nearlySorted"),
      "the two nearly-shapes agreed on a winner, so nothing rearranged",
    ).not.toBe(winnerOf("nearlyReversed"));
  });
});

describe("multi-run comparison statistics", () => {
  it("reports every algorithm, with averages inside the range a 16-item sort can produce", () => {
    const inputs = Array.from({ length: 20 }, () => shuffledRange(16));
    const stats = comparisonStats(inputs);

    expect(stats.map((row) => row.algorithm).sort()).toEqual(Object.keys(SORT_ALGORITHMS).sort());
    for (const row of stats) {
      // A 16-item sort cannot settle the order in fewer than 15 comparisons
      // (every value has to be measured against something), and our bubble
      // sort's fixed nested loop is the ceiling at n(n-1)/2 = 120.
      expect(row.averageComparisons, `${row.algorithm} average too low`).toBeGreaterThanOrEqual(15);
      expect(row.averageComparisons, `${row.algorithm} average too high`).toBeLessThanOrEqual(120);
      expect(row.fewestWins, `${row.algorithm} wins out of range`).toBeGreaterThanOrEqual(0);
      expect(row.fewestWins, `${row.algorithm} wins out of range`).toBeLessThanOrEqual(inputs.length);
    }

    // Ties count for every algorithm that ties, so the total is at least one
    // win per run -- that is what the table's caption promises the reader.
    const totalWins = stats.reduce((sum, row) => sum + row.fewestWins, 0);
    expect(totalWins).toBeGreaterThanOrEqual(inputs.length);
  });

  it("gives each algorithm the identical inputs", () => {
    const input = [16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
    const [first, second] = [comparisonStats([input]), comparisonStats([input])];
    expect(first).toEqual(second);
    // Worst case for both quadratic sorts: every pair gets compared.
    expect(first.find((row) => row.algorithm === "bubble")!.averageComparisons).toBe(120);
    expect(first.find((row) => row.algorithm === "insertion")!.averageComparisons).toBe(120);
  });

  // Stronger than the determinism check above: it recomputes each average from
  // the same 20 arrays by hand. If comparisonStats ever drew its own inputs per
  // algorithm, the averages would still look plausible and this would catch it.
  it("scores all four algorithms over the very same sample", () => {
    for (const shape of SHAPE_KEYS) {
      const inputs = shapeSample(shape, 16, 20);
      const stats = comparisonStats(inputs);
      for (const row of stats) {
        const byHand =
          inputs.reduce((sum, input) => sum + countComparisons(row.algorithm, input), 0) / inputs.length;
        expect(row.averageComparisons, `${row.algorithm} average on ${shape}`).toBe(byHand);
      }
    }
  });

  // The point of Amendment 3 in one assertion: the ranking is a property of the
  // input, not a fixed league table. Insertion sort beats merge sort on
  // nearly-sorted data and loses to it on nearly-reversed data.
  //
  // Only these two claims are asserted, and only in this direction. Measured
  // over 5000 samples of 20, the nearly-sorted margin is 1.28x and the
  // nearly-reversed margin 3.1x, both stable. Random is deliberately absent:
  // merge had the lowest average in 100% of those samples but by a narrowest
  // margin of 1.00x -- a tie broken by registry order -- so asserting a winner
  // there would be a coin flip dressed as a fact.
  it("reverses insertion and merge sort's ranking between the two nearly-ordered shapes", () => {
    const averageOf = (shape: ShapeKey) => {
      const stats = comparisonStats(shapeSample(shape, 16, 20));
      const find = (key: AlgorithmKey) => stats.find((row) => row.algorithm === key)!.averageComparisons;
      return { insertion: find("insertion"), merge: find("merge") };
    };

    const sorted = averageOf("nearlySorted");
    expect(
      sorted.insertion,
      `insertion ${sorted.insertion} did not beat merge ${sorted.merge} on nearly-sorted input`,
    ).toBeLessThan(sorted.merge);

    const reversed = averageOf("nearlyReversed");
    expect(
      reversed.insertion,
      `insertion ${reversed.insertion} did not lose to merge ${reversed.merge} on nearly-reversed input`,
    ).toBeGreaterThan(reversed.merge);
  });
});

/*
 * ---------------------------------------------------------------------------
 * PLAN.md Amendment 5: the improvement race. Four findings, one shared area,
 * original against improved on the identical array.
 * ---------------------------------------------------------------------------
 */

const ALGORITHM_KEYS = Object.keys(SORT_ALGORITHMS) as AlgorithmKey[];

/** Arrays per sample for the directional claims below. See the margins note. */
const CLAIM_SAMPLE = 200;

/** Mean comparisons for one variant over its own fresh sample of one shape. */
function meanOver(
  sort: (input: number[]) => ReturnType<(typeof SORT_ALGORITHMS)[AlgorithmKey]>,
  inputs: number[][],
): number {
  return inputs.reduce((sum, input) => sum + countVariantComparisons(sort, input), 0) / inputs.length;
}

// The improved variants animate in the same area as the originals, through the
// same generator contract, so they get the same three checks the originals get.
// Amendment 1's duplicate-bar bug was in a merge sort, and mergeSortSkipping is
// a merge sort with a new early return in it.
for (const shape of SHAPE_KEYS) {
  describe(`each improved variant, on ${shape} input`, () => {
    for (const key of ALGORITHM_KEYS) {
      const improved = IMPROVED_ALGORITHMS[key];

      it(`${key}: sorts the array and counts at least one comparison`, () => {
        const input = INPUT_SHAPES[shape](16);
        const generator = improved(input);
        let result = generator.next();
        while (!result.done) result = generator.next();

        expect(result.value.comparisons).toBeGreaterThan(0);
        for (let i = 1; i < result.value.array.length; i++) {
          expect(result.value.array[i]).toBeGreaterThanOrEqual(result.value.array[i - 1]);
        }
      });

      it(`${key}: every intermediate frame is a permutation of the input`, () => {
        const input = INPUT_SHAPES[shape](16);
        const expected = [...input].sort((a, b) => a - b);
        const generator = improved(input);

        let frame = 0;
        let result = generator.next();
        while (true) {
          const actual = [...result.value.array].sort((a, b) => a - b);
          expect(
            actual,
            `improved ${key} frame ${frame} on ${shape} input is not a permutation: [${result.value.array.join(", ")}]`,
          ).toEqual(expected);
          if (result.done) break;
          frame++;
          result = generator.next();
        }

        expect(frame, `improved ${key} yielded no intermediate frames`).toBeGreaterThan(0);
      });

      it(`${key}: reports in-range compared/pivot indices, and marks most frames`, () => {
        const input = INPUT_SHAPES[shape](16);
        const generator = improved(input);

        let frames = 0;
        let marked = 0;
        let result = generator.next();
        while (!result.done) {
          frames++;
          const { compared, pivot } = result.value;
          if (compared) {
            marked++;
            expect(compared[0], `improved ${key} compared an index with itself`).not.toBe(compared[1]);
            for (const index of compared) {
              expect(index, `improved ${key} compared index out of range`).toBeGreaterThanOrEqual(0);
              expect(index, `improved ${key} compared index out of range`).toBeLessThan(input.length);
            }
          }
          if (pivot !== undefined) {
            expect(pivot, `improved ${key} pivot index out of range`).toBeGreaterThanOrEqual(0);
            expect(pivot, `improved ${key} pivot index out of range`).toBeLessThan(input.length);
          }
          result = generator.next();
        }

        expect(
          marked / frames,
          `improved ${key} marked only ${marked} of ${frames} frames on ${shape} input`,
        ).toBeGreaterThan(0.5);
      });
    }
  });
}

describe("the improved variants stay out of the main race", () => {
  // Structural, not a matter of remembering: the main race builds its dropdowns
  // from SORT_ALGORITHMS, and the improvements live in their own registry, so
  // "no improved variants in the main race" is enforced by there being no route
  // from one map to the other.
  it("is a separate registry, sharing no function with the originals", () => {
    expect(Object.keys(IMPROVED_ALGORITHMS).sort()).toEqual([...ALGORITHM_KEYS].sort());
    for (const key of ALGORITHM_KEYS) {
      expect(
        Object.values(SORT_ALGORITHMS),
        `improved ${key} is also registered as an original`,
      ).not.toContain(IMPROVED_ALGORITHMS[key]);
    }
  });

  it("leaves both main-race dropdowns offering the four originals only", () => {
    const dom = new JSDOM(RACE_HTML);
    const { document } = dom.window;
    initRace(document);

    for (const id of ["a", "b"]) {
      const select = document.querySelector(`[data-testid="algorithm-select-${id}"]`) as HTMLSelectElement;
      expect(
        [...select.options].map((option) => option.value).sort(),
        `side ${id} does not offer exactly the four originals`,
      ).toEqual([...ALGORITHM_KEYS].sort());
    }
  });
});

/*
 * The four claims the page makes, in the direction it makes them. Measured
 * before being asserted: 2000 trials of a 200-array sample per algorithm per
 * shape (400,000 arrays per cell), recording the extremes of the mean
 * difference. Each bound below sits well inside the worst trial observed, so a
 * failure here means the behaviour changed, not that a sample was unlucky:
 *
 *   bubble    nearlySorted    saved 44.08 to 60.14   asserted >= 30
 *   bubble    nearlyReversed  saved  0.00 to  0.07   asserted within 1
 *   insertion random          saved 25.18 to 29.98   asserted >= 15
 *   insertion nearlyReversed  saved 65.72 to 67.86   asserted >= 40
 *   insertion nearlySorted    cost  14.62 to 16.65   asserted >= 5
 *   merge     nearlySorted    saved  3.85 to  5.90   asserted >= 1.5
 *   merge     random          cost   9.06 to 10.12   asserted >= 4
 *   merge     nearlyReversed  cost  13.85 to 14.21   asserted >= 7
 *   quick     nearlySorted    saved 39.84 to 48.52   asserted >= 20
 *   quick     nearlyReversed  saved 34.51 to 44.27   asserted >= 18
 *   quick     random          moved -2.76 to +2.26   asserted within 6
 */
describe("what the improvement race claims", () => {
  const claims: {
    key: AlgorithmKey;
    shape: ShapeKey;
    direction: "saves" | "costs" | "unchanged";
    margin: number;
  }[] = [
    { key: "bubble", shape: "nearlySorted", direction: "saves", margin: 30 },
    { key: "bubble", shape: "nearlyReversed", direction: "unchanged", margin: 1 },
    { key: "insertion", shape: "random", direction: "saves", margin: 15 },
    { key: "insertion", shape: "nearlyReversed", direction: "saves", margin: 40 },
    { key: "insertion", shape: "nearlySorted", direction: "costs", margin: 5 },
    { key: "merge", shape: "nearlySorted", direction: "saves", margin: 1.5 },
    { key: "merge", shape: "random", direction: "costs", margin: 4 },
    { key: "merge", shape: "nearlyReversed", direction: "costs", margin: 7 },
    { key: "quick", shape: "nearlySorted", direction: "saves", margin: 20 },
    { key: "quick", shape: "nearlyReversed", direction: "saves", margin: 18 },
    { key: "quick", shape: "random", direction: "unchanged", margin: 6 },
  ];

  for (const { key, shape, direction, margin } of claims) {
    it(`${key} + ${IMPROVEMENTS[key].label} ${direction} on ${shape} input`, () => {
      const inputs = shapeSample(shape, 16, CLAIM_SAMPLE);
      const original = meanOver(SORT_ALGORITHMS[key], inputs);
      const improved = meanOver(IMPROVED_ALGORITHMS[key], inputs);
      const note = `${key}: original ${original.toFixed(2)}, improved ${improved.toFixed(2)} on ${shape}`;

      if (direction === "saves") expect(original - improved, note).toBeGreaterThanOrEqual(margin);
      if (direction === "costs") expect(improved - original, note).toBeGreaterThanOrEqual(margin);
      if (direction === "unchanged") expect(Math.abs(improved - original), note).toBeLessThanOrEqual(margin);
    });
  }

  // The one claim on the page that is absolute rather than average: an early
  // exit can only ever stop the loop sooner. Checked per array, not on the mean,
  // because a mean can hide an array where it cost something.
  it("bubble's early exit never costs a single comparison, on any array", () => {
    for (const shape of SHAPE_KEYS) {
      for (const input of shapeSample(shape, 16, CLAIM_SAMPLE)) {
        const original = countVariantComparisons(SORT_ALGORITHMS.bubble, input);
        const improved = countVariantComparisons(IMPROVED_ALGORITHMS.bubble, input);
        expect(improved, `early exit cost comparisons on [${input.join(", ")}]`).toBeLessThanOrEqual(
          original,
        );
      }
    }
  });

  // The honest half of the random pivot: it improves the expected cost, and the
  // bad split is still reachable, so the same array does not cost the same twice.
  // Measured: 12 races of one array give 9.5 distinct counts on average and were
  // never all identical in 2000 trials per shape. Asserted across three arrays
  // so one freak array cannot fail the suite.
  it("quick sort's random pivot makes the same array cost different amounts", () => {
    for (const shape of SHAPE_KEYS) {
      const varied = shapeSample(shape, 16, 3).filter((input) => {
        const counts = new Set(
          Array.from({ length: 12 }, () => countVariantComparisons(IMPROVED_ALGORITHMS.quick, input)),
        );
        return counts.size > 1;
      });
      expect(varied.length, `random pivot was deterministic on all three ${shape} arrays`).toBeGreaterThan(
        0,
      );
    }
  });

  // The original's counts must stay fixed for a given array, or the comparison
  // above is measuring noise on both sides.
  it("leaves the original quick sort deterministic", () => {
    const input = INPUT_SHAPES.random(16);
    const counts = new Set(Array.from({ length: 12 }, () => countComparisons("quick", input)));
    expect(counts.size, `original quick sort varied: ${[...counts].join(", ")}`).toBe(1);
  });
});

/*
 * The 20-run comparison (PLAN.md Amendment 6). The direction of each
 * improvement is already asserted above at 200 samples; what this block asserts
 * is what the *20-array* block on the page promises, in counts rather than
 * averages, because counts out of 20 are what the reader is shown.
 *
 * Bounds measured before being written, over 20,000 samples of 20 arrays each
 * (won / tied / lost, out of 20, min..max observed):
 *   bubble    random          16..20 won,  0..11 tied,  0 lost
 *   bubble    nearlySorted    16..20 won,  0..4  tied,  0 lost
 *   bubble    nearlyReversed   0..5  won, 15..20 tied,  0 lost
 *   insertion random          18..20 won,  0..2  tied,  0..2 lost
 *   insertion nearlySorted     0..1  won,  0..2  tied, 18..20 lost
 *   insertion nearlyReversed  20..20 won,  0     tied,  0 lost
 *   merge     random           0..1  won,  0..1  tied, 19..20 lost
 *   merge     nearlySorted     9..20 won,  0..7  tied,  0..9 lost
 *   merge     nearlyReversed   0     won,  0     tied, 20..20 lost
 *   quick     random           2..18 won,  0..6  tied,  2..18 lost
 *   quick     nearlySorted    16..20 won,  0..2  tied,  0..4 lost
 *   quick     nearlyReversed  15..20 won,  0..3  tied,  0..4 lost
 * Every assertion below sits well inside its worst observed trial. Quick sort on
 * random input is deliberately not given a direction: 2..18 IS the finding, and
 * a test claiming otherwise would be a flake waiting to happen.
 */
describe("the 20-run comparison", () => {
  const RUNS = 20;

  it("accounts for every array as a win, a tie or a loss", () => {
    for (const key of ALGORITHM_KEYS) {
      for (const shape of SHAPE_KEYS) {
        const result = improvementComparison(key, shapeSample(shape, 16, RUNS));
        expect(
          result.improvedWins + result.ties + result.improvedLosses,
          `${key}/${shape}: ${result.improvedWins}/${result.ties}/${result.improvedLosses} does not add to ${RUNS}`,
        ).toBe(RUNS);
      }
    }
  });

  // Fairness, asserted rather than promised in the caption: both averages must
  // equal what the same arrays produce when counted independently, which they
  // can only do if both variants were given those same arrays.
  it("measures both variants on the identical arrays", () => {
    for (const key of ALGORITHM_KEYS) {
      const inputs = shapeSample("random", 16, RUNS);
      const result = improvementComparison(key, inputs);
      const mean = (sort: (input: number[]) => ReturnType<(typeof SORT_ALGORITHMS)[AlgorithmKey]>) =>
        inputs.reduce((total, input) => total + countVariantComparisons(sort, input), 0) / inputs.length;

      expect(result.originalAverage, `${key}: original average is not the mean over those arrays`).toBe(
        mean(SORT_ALGORITHMS[key]),
      );
      // Quick sort's improved side is random, so its average is re-measured here
      // rather than compared: the check is that it lands in the same range, not
      // that a random algorithm repeats itself.
      if (key === "quick") {
        expect(result.improvedAverage).toBeGreaterThan(0);
      } else {
        expect(result.improvedAverage, `${key}: improved average is not the mean over those arrays`).toBe(
          mean(IMPROVED_ALGORITHMS[key]),
        );
      }
    }
  });

  it("reports zeros for an empty sample rather than dividing by nothing", () => {
    expect(improvementComparison("bubble", [])).toEqual({
      originalAverage: 0,
      improvedAverage: 0,
      improvedWins: 0,
      ties: 0,
      improvedLosses: 0,
    });
  });

  // The section's whole argument, in counts: the same change wins on one shape
  // and loses on another. If this ever passes trivially -- all three shapes
  // agreeing -- the page has stopped making the point it exists to make.
  const counts: { key: AlgorithmKey; shape: ShapeKey; field: "improvedWins" | "ties" | "improvedLosses"; least: number }[] = [
    { key: "bubble", shape: "nearlySorted", field: "improvedWins", least: 12 },
    { key: "bubble", shape: "nearlyReversed", field: "ties", least: 10 },
    { key: "insertion", shape: "random", field: "improvedWins", least: 15 },
    { key: "insertion", shape: "nearlySorted", field: "improvedLosses", least: 15 },
    { key: "insertion", shape: "nearlyReversed", field: "improvedWins", least: 18 },
    { key: "merge", shape: "random", field: "improvedLosses", least: 15 },
    { key: "merge", shape: "nearlySorted", field: "improvedWins", least: 5 },
    { key: "merge", shape: "nearlyReversed", field: "improvedLosses", least: 18 },
    { key: "quick", shape: "nearlySorted", field: "improvedWins", least: 12 },
    { key: "quick", shape: "nearlyReversed", field: "improvedWins", least: 12 },
  ];

  for (const { key, shape, field, least } of counts) {
    it(`${key} on ${shape} input: at least ${least} of ${RUNS} arrays ${field}`, () => {
      const result = improvementComparison(key, shapeSample(shape, 16, RUNS));
      expect(
        result[field],
        `${key}/${shape}: ${result.improvedWins} won, ${result.ties} tied, ${result.improvedLosses} lost`,
      ).toBeGreaterThanOrEqual(least);
    });
  }

  it("never records a loss for bubble sort's early exit, on any shape", () => {
    for (const shape of SHAPE_KEYS) {
      const result = improvementComparison("bubble", shapeSample(shape, 16, RUNS));
      expect(result.improvedLosses, `early exit lost on ${shape} input`).toBe(0);
    }
  });
});

/*
 * The tolerance on the comparison's highlight (PLAN.md Amendment 7). Twenty
 * arrays is a small sample, so a cell whose two averages differ by a couple of
 * comparisons is showing this sample's noise, not a difference; marking one
 * column there tells the reader something untrue.
 *
 * The band itself is tested on constructed numbers rather than on samples, so
 * these cannot flake: the rule is arithmetic, and the sampling question is a
 * separate one asked below.
 */
describe("the tolerance on the average highlight", () => {
  const RUNS = 20;

  it("leaves a difference inside the band unmarked, in either direction", () => {
    const inside = AVERAGE_TOLERANCE - 0.1;
    expect(averageDirection(50, 50)).toBe("same");
    expect(averageDirection(50, 50 - inside)).toBe("same");
    expect(averageDirection(50, 50 + inside)).toBe("same");
  });

  it("marks a difference at or beyond the band, naming the cheaper side", () => {
    // At exactly the tolerance it is a difference: the caption says averages
    // *under* 2.5 apart are left unmarked, so 2.5 has to be marked or the page
    // and the code disagree by one edge case.
    expect(averageDirection(50, 50 - AVERAGE_TOLERANCE)).toBe("better");
    expect(averageDirection(50, 50 + AVERAGE_TOLERANCE)).toBe("worse");
    expect(averageDirection(120, 24.8)).toBe("better");
    expect(averageDirection(24.8, 120)).toBe("worse");
  });

  /*
   * What the band does to the real cells, measured before being asserted: the
   * closest approach of |improvedAverage - originalAverage| over 3,000 samples of
   * 20 arrays each was
   *   bubble/nearlyReversed     0.0 .. 0.3     always inside the band
   *   bubble/random             1.7 .. 13.5
   *   merge/nearlySorted        1.8 ..  8.2
   *   quick/random              0.0 .. 11.2
   *   the other eight cells     7.8 .. 73.6    never inside the band
   *
   * So only nine of the twelve cells can be asserted. Three are deliberately
   * left out, and the reason differs:
   *   quick/random     the improvement genuinely changes nothing on average, and
   *                    at 20 arrays the noise is wider than the band -- about one
   *                    draw in four is still marked. That is the honest state of
   *                    the measurement, so no test claims otherwise.
   *   merge/nearlySorted, bubble/random
   *                    real savings (4.8 and 6.5) that this sample size can shrink
   *                    to under 2.5. Asserting them would be a flake, and
   *                    widening the band to cover them would erase merge's whole
   *                    finding in over half of all draws.
   * Amendment 7 said "the nine large cells" here; the measurement above says the
   * ninth is bubble/random, whose margin is thin, so this asserts eight plus the
   * always-neutral one. Recorded rather than quietly adjusted.
   */
  const cells: { key: AlgorithmKey; shape: ShapeKey; expected: "better" | "same" | "worse" }[] = [
    { key: "bubble", shape: "nearlySorted", expected: "better" },
    { key: "bubble", shape: "nearlyReversed", expected: "same" },
    { key: "insertion", shape: "random", expected: "better" },
    { key: "insertion", shape: "nearlySorted", expected: "worse" },
    { key: "insertion", shape: "nearlyReversed", expected: "better" },
    { key: "merge", shape: "random", expected: "worse" },
    { key: "merge", shape: "nearlyReversed", expected: "worse" },
    { key: "quick", shape: "nearlySorted", expected: "better" },
    { key: "quick", shape: "nearlyReversed", expected: "better" },
  ];

  for (const { key, shape, expected } of cells) {
    it(`reads ${key} on ${shape} input as ${expected}, over ${RUNS} arrays`, () => {
      const result = improvementComparison(key, shapeSample(shape, 16, RUNS));
      const direction = averageDirection(
        Number(result.originalAverage.toFixed(1)),
        Number(result.improvedAverage.toFixed(1)),
      );
      expect(
        direction,
        `${key}/${shape}: original ${result.originalAverage.toFixed(1)}, improved ${result.improvedAverage.toFixed(1)}`,
      ).toBe(expected);
    });
  }
});

describe("the improvement race", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const setup = () => {
    const dom = new JSDOM(RACE_HTML);
    const { document } = dom.window;
    initRace(document);
    const click = (testid: string) =>
      document.querySelector(`[data-testid="${testid}"]`)!.dispatchEvent(
        new dom.window.Event("click", { bubbles: true }),
      );
    const barValues = (side: string) =>
      [...document.querySelectorAll(`[data-testid="improve-bars-${side}"] .bar`)].map((bar) =>
        Number((bar as HTMLElement).dataset.value),
      );
    const counter = (side: string) =>
      Number(document.querySelector(`[data-testid="improve-counter-${side}"]`)!.textContent);
    // Read off the rendered page rather than restated as a constant here: the
    // cards' findings are functions of the array length, and a length typed into
    // this file could go stale against the one the module actually draws.
    const arrayLength = document.querySelectorAll('[data-testid="bars-a"] .bar').length;
    return { dom, document, click, barValues, counter, arrayLength };
  };

  // Amendment 8: the card answers "what did we discover?" before "what could we
  // change?", so this asserts the ORDER and not merely that both texts are
  // somewhere in the card. Order is the whole request -- both strings were
  // already present before the change, the wrong way round, and every check was
  // green.
  it("offers one card per algorithm, stating the finding above the improvement", () => {
    const { document, arrayLength } = setup();
    const cards = [...document.querySelectorAll('[data-testid="finding-cards"] button')];

    expect(cards.length, "one card per algorithm").toBe(ALGORITHM_KEYS.length);
    for (const key of ALGORITHM_KEYS) {
      const card = cards.find((button) => (button as HTMLElement).dataset.algorithm === key);
      expect(card, `no card for ${key}`).toBeTruthy();

      const finding = card!.querySelector(".card-finding");
      const label = card!.querySelector(".card-label");
      expect(finding?.textContent, `card for ${key} omits its finding`).toBe(
        IMPROVEMENTS[key].finding(arrayLength),
      );
      expect(label?.textContent, `card for ${key} omits its improvement`).toContain(
        IMPROVEMENTS[key].label,
      );

      // DOCUMENT_POSITION_FOLLOWING: the finding element comes before the label
      // element in the document, which is what a reader meets first.
      const order = finding!.compareDocumentPosition(label!);
      expect(
        order & 4,
        `card for ${key} shows the improvement before the finding`,
      ).toBeGreaterThan(0);

      // The improvement is offered as a proposal, not stated as a result: the
      // card is a finding that suggests something, and the reader has not run it
      // yet when they read the card.
      expect(label!.textContent, `card for ${key} does not offer the change as a proposal`).toMatch(
        /^Try:/,
      );

      // A true number can still make a false claim. Bubble's "120 comparisons
      // every time" and Quick's "more work on nearly-sorted than on random" are
      // both artefacts of the variants we implemented, so the card names the
      // variant; insertion and merge are the ordinary versions and say nothing.
      const variant = card!.querySelector(".card-variant");
      if (ALGORITHM_VARIANTS[key]) {
        expect(variant?.textContent, `${key}'s card does not name the variant it measured`).toBe(
          ALGORITHM_VARIANTS[key],
        );
      } else {
        expect(variant, `${key} is the ordinary version but its card claims a variant`).toBeNull();
      }
    }
  });

  // The exact sentence CLAUDE.md exists for. "Doesn't adapt to its input" is true
  // of two fixed loops and false of bubble sort, so the number and the variant
  // that produced it have to be readable together, in the same card.
  it("never lets bubble's flat count be read as a fact about bubble sort", () => {
    const { document, arrayLength } = setup();
    const card = document.querySelector('[data-testid="finding-card-bubble"]')!;
    const text = card.textContent!;

    expect(text, "bubble's card states a count").toContain(
      String((arrayLength * (arrayLength - 1)) / 2),
    );
    expect(text, "bubble's card states its count without saying which bubble sort").toContain(
      ALGORITHM_VARIANTS.bubble,
    );
  });

  // The requested structure, asserted by counting: choosing a finding loads it
  // into the ONE area, so four cards can never become four races on the page.
  it("loads every card into the same single area, replacing what was there", () => {
    const { document, click } = setup();
    const seen = new Set<string>();

    for (const key of ALGORITHM_KEYS) {
      click(`finding-card-${key}`);
      expect(document.querySelectorAll('[data-testid="improve-area"]').length, "more than one race area").toBe(
        1,
      );
      expect(document.querySelectorAll('[data-testid^="improve-bars-"]').length, "more than two bar rows").toBe(
        2,
      );

      const area = document.querySelector('[data-testid="improve-area"]') as HTMLElement;
      expect(area.dataset.algorithm, `area did not switch to ${key}`).toBe(key);
      const title = document.querySelector('[data-testid="improve-title"]')!.textContent!;
      expect(title, `title did not switch to ${key}`).toContain(IMPROVEMENTS[key].label);
      seen.add(title);

      // The mechanism, not just the label: "improved" has to say what changed.
      expect(document.querySelector('[data-testid="improve-change"]')!.textContent).toContain(
        IMPROVEMENTS[key].change,
      );
      expect(document.querySelector('[data-testid="improve-expect"]')!.textContent!.length).toBeGreaterThan(
        0,
      );
    }

    expect(seen.size, "the four cards did not each change the area").toBe(ALGORITHM_KEYS.length);
  });

  // Choose a finding -> Original vs Improved -> Race, in that order, enforced by
  // the controls rather than by instructions in the copy.
  it("keeps its controls disabled until a finding is chosen", () => {
    const { document, click, barValues } = setup();
    const shuffle = document.querySelector('[data-testid="improve-shuffle"]') as HTMLButtonElement;
    const raceButton = document.querySelector('[data-testid="improve-race"]') as HTMLButtonElement;

    expect(shuffle.disabled, "New array was live before a finding was chosen").toBe(true);
    expect(raceButton.disabled, "Race was live before a finding was chosen").toBe(true);
    expect(barValues("original").length, "bars were drawn before a finding was chosen").toBe(0);

    // Pressing the disabled Race must also do nothing if it is reached anyway.
    click("improve-race");
    vi.runAllTimers();
    expect(barValues("original").length, "the disabled Race button still ran").toBe(0);

    click("finding-card-bubble");
    expect(shuffle.disabled, "New array stayed disabled after choosing").toBe(false);
    expect(raceButton.disabled, "Race stayed disabled after choosing").toBe(false);
    expect(barValues("original").length, "no array was drawn on choosing").toBe(16);
  });

  it("gives both sides the identical array, on every card and every press", () => {
    const { click, barValues } = setup();
    for (const key of ALGORITHM_KEYS) {
      click(`finding-card-${key}`);
      for (let press = 0; press < 5; press++) {
        click("improve-shuffle");
        expect(barValues("original").length, `no bars for ${key}`).toBe(16);
        expect(barValues("original"), `${key}: the two sides got different arrays`).toEqual(
          barValues("improved"),
        );
      }
    }
  });

  // Amendment 9 REVERSES Amendment 5's decision (reaffirmed in Amendment 6),
  // which was "no second shape selector -- the improvement race reads the same
  // control the main race does". The old test asserting that is deleted, not
  // relaxed: the improvement race now owns its starting shape, so the two races
  // are independent experiments rather than two views of one condition.
  it("offers the same three starting shapes as the main race", () => {
    const { document } = setup();
    const improveSelect = document.querySelector(
      '[data-testid="improve-shape-select"]',
    ) as HTMLSelectElement;
    const mainSelect = document.querySelector('[data-testid="shape-select"]') as HTMLSelectElement;

    const options = (select: HTMLSelectElement) =>
      [...select.options].map((option) => [option.value, option.textContent]);

    expect(
      options(improveSelect).map(([value]) => value),
      "the improvement race does not offer exactly the three shapes",
    ).toEqual(SHAPE_KEYS);
    // Same labels too, not just the same keys: two controls that read
    // differently look like two different questions.
    expect(options(improveSelect), "the two selectors disagree about the shapes").toEqual(
      options(mainSelect),
    );
    expect(improveSelect.value, "the improvement race does not start on random").toBe("random");
  });

  it("re-rolls its own array to the chosen shape, both sides identical", () => {
    const { dom, document, click, barValues } = setup();
    const improveSelect = document.querySelector(
      '[data-testid="improve-shape-select"]',
    ) as HTMLSelectElement;
    click("finding-card-quick");

    improveSelect.value = "nearlySorted";
    improveSelect.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    const ordered = barValues("original");
    expect(ordered, "the two sides diverged on a shape change").toEqual(barValues("improved"));
    expect(inversions(ordered), `not nearly sorted: ${ordered.join(", ")}`).toBeLessThanOrEqual(40);

    improveSelect.value = "nearlyReversed";
    improveSelect.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    const reversed = barValues("original");
    expect(reversed, "the two sides diverged on a second shape change").toEqual(
      barValues("improved"),
    );
    // Nearly reversed is nearly-sorted's mirror: almost every pair is inverted.
    const pairs = (reversed.length * (reversed.length - 1)) / 2;
    expect(
      inversions(reversed),
      `not nearly reversed: ${reversed.join(", ")}`,
    ).toBeGreaterThanOrEqual(pairs - 40);
  });

  // The independence is the point of the amendment, and it has to hold in BOTH
  // directions -- a shared array would show up as one selector silently redrawing
  // the other race's bars.
  it("leaves the other race's array alone, in both directions", () => {
    const { dom, document, click, barValues } = setup();
    const improveSelect = document.querySelector(
      '[data-testid="improve-shape-select"]',
    ) as HTMLSelectElement;
    const mainSelect = document.querySelector('[data-testid="shape-select"]') as HTMLSelectElement;
    const mainBars = () =>
      [...document.querySelectorAll('[data-testid="bars-a"] .bar')].map((bar) =>
        Number((bar as HTMLElement).dataset.value),
      );
    click("finding-card-bubble");

    const mainBefore = mainBars();
    improveSelect.value = "nearlyReversed";
    improveSelect.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    expect(mainBars(), "the improvement selector redrew the main race").toEqual(mainBefore);

    const improveBefore = barValues("original");
    mainSelect.value = "nearlySorted";
    mainSelect.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    expect(barValues("original"), "the main selector redrew the improvement race").toEqual(
      improveBefore,
    );
    expect(barValues("improved"), "the main selector split the improvement race").toEqual(
      improveBefore,
    );
  });

  // Each race locks only its own selector. Locking both would make one race's
  // controls go dead while the other one runs, which reads as a bug.
  it("locks each starting-data selector to its own race", () => {
    const { document, click } = setup();
    const improveSelect = document.querySelector(
      '[data-testid="improve-shape-select"]',
    ) as HTMLSelectElement;
    const mainSelect = document.querySelector('[data-testid="shape-select"]') as HTMLSelectElement;

    // Disabled until a finding is chosen, like the other improvement controls --
    // there is no array to re-roll before then.
    expect(improveSelect.disabled, "the improvement selector was live before a card").toBe(true);
    expect(mainSelect.disabled, "the main selector started disabled").toBe(false);

    click("finding-card-merge");
    expect(improveSelect.disabled, "the improvement selector stayed locked after a card").toBe(
      false,
    );

    click("improve-race");
    vi.advanceTimersToNextTimer();
    expect(improveSelect.disabled, "the improvement selector stayed live mid-race").toBe(true);
    expect(mainSelect.disabled, "the improvement race locked the main selector").toBe(false);
    vi.runAllTimers();
    expect(improveSelect.disabled, "the improvement selector stayed locked after its race").toBe(
      false,
    );

    click("race-button");
    vi.advanceTimersToNextTimer();
    expect(mainSelect.disabled, "the main selector stayed live mid-race").toBe(true);
    expect(improveSelect.disabled, "the main race locked the improvement selector").toBe(false);
    vi.runAllTimers();
  });

  // The 20-array table is shape-INDEPENDENT: it reports all three shapes at once,
  // so a shape change has nothing to tell it. This asserts it does not quietly
  // rebuild (which would look like the numbers had been re-measured for the new
  // shape, and they would not have been).
  it("does not rebuild the 20-array table when the shape changes", () => {
    const { dom, document, click } = setup();
    const improveSelect = document.querySelector(
      '[data-testid="improve-shape-select"]',
    ) as HTMLSelectElement;
    click("finding-card-insertion");

    const head = document.querySelector('[data-testid="improve-stats-head"]')!;
    const body = document.querySelector('[data-testid="improve-stats-body"]')!;
    const headings = [...head.querySelectorAll("th")].map((th) => th.textContent);
    for (const shape of SHAPE_KEYS) {
      expect(headings, `the table stopped reporting ${shape}`).toContain(SHAPE_LABELS[shape]);
    }
    const before = body.innerHTML;

    improveSelect.value = "nearlyReversed";
    improveSelect.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    expect(body.innerHTML, "a shape change re-rendered the three-shape table").toBe(before);
  });

  it("ends both sides sorted, with counts that then stop changing", () => {
    const { document, click, barValues, counter } = setup();
    click("finding-card-insertion");
    click("improve-race");
    vi.runAllTimers();

    for (const side of ["original", "improved"]) {
      const panel = document.querySelector(`[data-testid="improve-panel-${side}"]`) as HTMLElement;
      expect(panel.dataset.sorted, `${side} never reported sorted`).toBe("true");
      const values = barValues(side);
      for (let i = 1; i < values.length; i++) {
        expect(values[i], `${side} bars out of order: ${values.join(", ")}`).toBeGreaterThanOrEqual(
          values[i - 1],
        );
      }
      const before = counter(side);
      expect(before, `${side} counted no comparisons`).toBeGreaterThan(0);
      vi.runAllTimers();
      expect(counter(side), `${side} kept counting after sorting`).toBe(before);
    }
  });

  it("marks the winner by fewest comparisons, for every card", () => {
    const { document, click, counter } = setup();

    for (const key of ALGORITHM_KEYS) {
      click(`finding-card-${key}`);
      click("improve-race");
      vi.runAllTimers();

      const counts = { original: counter("original"), improved: counter("improved") };
      const fewest = Math.min(counts.original, counts.improved);
      for (const side of ["original", "improved"] as const) {
        const panel = document.querySelector(`[data-testid="improve-panel-${side}"]`) as HTMLElement;
        expect(
          panel.dataset.winner === "true",
          `${key}: ${side} made ${counts[side]} comparisons, fewest was ${fewest}`,
        ).toBe(counts[side] === fewest);
      }
    }
  });

  // Racing the same array again has to be possible, because for quick sort the
  // repeat is the finding: the improvement is expected-case, so two races of one
  // array can disagree.
  it("can race the same array again, and clears the previous result first", () => {
    const { document, click, counter } = setup();
    click("finding-card-quick");

    click("improve-race");
    vi.runAllTimers();
    const firstOriginal = counter("original");
    expect(counter("improved"), "the first race produced no count").toBeGreaterThan(0);

    click("improve-race");
    const panel = document.querySelector('[data-testid="improve-panel-original"]') as HTMLElement;
    expect(panel.dataset.winner, "last race's winner border survived into the next race").toBeUndefined();
    expect(panel.dataset.sorted, "the panel still claimed to be sorted mid-race").toBeUndefined();
    vi.runAllTimers();

    // The bars end sorted, so they cannot show whether the array was reused. The
    // ORIGINAL quick sort is deterministic for a given array (asserted above),
    // so an identical count on both races is the evidence that no new array was
    // generated -- and the improved side is free to differ, which is the point.
    expect(counter("original"), "the re-race started from a different array").toBe(firstOriginal);
    expect(counter("improved"), "the re-race produced no count").toBeGreaterThan(0);
  });

  // A second check deleted by Amendment 9, deliberately and out loud: this used
  // to assert that the improvement race locked the MAIN race's shape selector,
  // which was correct while the two races shared one condition. They no longer
  // do, so the assertion is now backwards -- locking a control that has nothing
  // to do with the running race just makes the page look broken. What it was
  // protecting (you cannot change the condition out from under a running race)
  // is kept by "locks each starting-data selector to its own race" above, which
  // checks both races and both selectors instead of one pairing.

  /*
   * The comparison block below the animated race (PLAN.md Amendment 6).
   */

  // Reads the rendered table back as data, so these assert what a reader sees
  // rather than what the module returned.
  //
  // Amendment 8 transposed the table to match the statistics matrix: shapes
  // across the top, Original and Improved down the side. So this now reads it by
  // COLUMN -- one entry per shape, each holding the two cells being compared --
  // because a column is the unit of comparison, exactly as it is in the matrix
  // above. Cell anatomy is unchanged from Amendment 7: a big `.avg` with an
  // optional `<small>` under it.
  const readTable = (document: Document) => {
    const body = document.querySelector('[data-testid="improve-stats-body"]')!;
    const rows = [...body.querySelectorAll("tr")];
    if (rows.length === 0) return [];

    const readCell = (variant: string, shape: string) => {
      const row = body.querySelector(`tr[data-variant="${variant}"]`);
      const cell = row?.querySelector<HTMLElement>(`td[data-shape="${shape}"]`);
      if (!cell) return null;
      return {
        average: cell.querySelector(".avg")!.textContent!,
        note: cell.querySelector("small")?.textContent ?? null,
        marked: cell.dataset.fewest === "true",
        direction: cell.dataset.direction ?? null,
      };
    };

    // Driven off the header rather than off SHAPE_KEYS, so a column the header
    // does not announce cannot be read as if it were labelled.
    const shapes = [
      ...document.querySelectorAll<HTMLElement>('[data-testid="improve-stats-head"] th[data-shape]'),
    ].map((th) => th.dataset.shape!);

    return shapes.map((shape) => ({
      shape,
      variantRows: rows.map((row) => (row as HTMLElement).dataset.variant),
      original: readCell("original", shape),
      improved: readCell("improved", shape),
    }));
  };

  it("shows all three shapes as soon as a card is chosen, with no press", () => {
    const { document, click } = setup();
    expect(readTable(document).length, "the comparison was populated before any card").toBe(0);

    click("finding-card-insertion");
    const columns = readTable(document);
    expect(columns.map((column) => column.shape), "not one column per shape, in shape order").toEqual(
      SHAPE_KEYS,
    );

    for (const column of columns) {
      const { original, improved } = column;
      // Two rows, Original then Improved -- the layout the brief asked for, and
      // the reason the highlight is now read downwards like the matrix's.
      expect(column.variantRows, `${column.shape}: not Original then Improved`).toEqual([
        "original",
        "improved",
      ]);
      expect(Number(original!.average), `${column.shape}: original average is not a number`).toBeGreaterThan(0);
      expect(Number(improved!.average), `${column.shape}: improved average is not a number`).toBeGreaterThan(0);
      expect(original!.note, `${column.shape}: the original row grew a count of its own`).toBeNull();

      // Won / tied / lost, all three, accounting for all 20 arrays. Under the
      // Improved cell, once per column.
      const parts = improved!.note!.split("/").map((part) => Number(part.trim()));
      expect(parts.length, `${column.shape}: "${improved!.note}" is not three counts`).toBe(3);
      expect(parts.reduce((a, b) => a + b, 0), `${column.shape}: "${improved!.note}" does not add to 20`).toBe(
        20,
      );

      // The highlight is derived from the same two averages the column prints,
      // via the same tolerance the module exports, so it cannot disagree with
      // them. The verdict is carried on the Improved cell, since that is the one
      // that represents the change.
      const expected = averageDirection(Number(original!.average), Number(improved!.average));
      expect(
        improved!.direction,
        `${column.shape}: marked ${improved!.direction} for ${original!.average} vs ${improved!.average}`,
      ).toBe(expected);
      expect(original!.marked, `${column.shape}: wrong cell highlighted`).toBe(expected === "worse");
      expect(improved!.marked, `${column.shape}: wrong cell highlighted`).toBe(expected === "better");
    }
  });

  it("marks neither average when they are within the measured noise band", () => {
    const { document, click } = setup();
    click("finding-card-quick");

    for (const { shape, original, improved } of readTable(document)) {
      const gap = Math.abs(Number(improved!.average) - Number(original!.average));
      if (gap < AVERAGE_TOLERANCE) {
        expect(
          [original!.marked, improved!.marked],
          `${shape}: ${gap.toFixed(1)} apart and still marked`,
        ).toEqual([false, false]);
      } else {
        expect(
          original!.marked || improved!.marked,
          `${shape}: ${gap.toFixed(1)} apart and marked nothing`,
        ).toBe(true);
      }
    }
  });

  it("rebuilds the comparison for the card just chosen, naming both variants", () => {
    const { document, click } = setup();
    const table = document.querySelector('[data-testid="improve-stats"]') as HTMLElement;

    for (const key of ALGORITHM_KEYS) {
      click(`finding-card-${key}`);
      expect(table.dataset.algorithm, `the comparison still belongs to another card`).toBe(key);
      expect(readTable(document).length, `${key}: lost a shape column`).toBe(SHAPE_KEYS.length);

      // Amendment 8: the two variants are named in the row headers as well, the
      // same idiom the matrix above uses for its algorithms -- so a reader
      // scanning the table alone still knows which code produced which row.
      const rowHeaders = [
        ...document.querySelectorAll('[data-testid="improve-stats-body"] th'),
      ].map((th) => th.textContent!);
      expect(rowHeaders.join(" | "), `${key}: a row header does not name its variant`).toContain(
        IMPROVEMENTS[key].label,
      );
      expect(rowHeaders.join(" | "), `${key}: the original row does not name its variant`).toContain(
        ALGORITHM_VARIANTS[key] || "ordinary version",
      );

      // A true number can still make a false claim: which variant produced each
      // column travels with the numbers, not in a footnote elsewhere.
      const scope = document.querySelector('[data-testid="improve-stats-scope"]')!.textContent!;
      expect(scope, `${key}: the comparison does not say which improvement it ran`).toContain(
        IMPROVEMENTS[key].label,
      );
      expect(scope, `${key}: the comparison does not say which original it ran`).toContain(
        ALGORITHM_VARIANTS[key] || "ordinary version",
      );
    }
  });

  // At most one cell marked per column, and none when the column is neutral. In
  // the transposed table a second mark in a column would read as "both used
  // fewer", which is not a thing two numbers can both be.
  it("marks at most one of the two cells in any column", () => {
    const { document, click } = setup();
    for (const key of ALGORITHM_KEYS) {
      click(`finding-card-${key}`);
      for (const { shape, original, improved } of readTable(document)) {
        const marks = [original!.marked, improved!.marked].filter(Boolean).length;
        expect(marks, `${key}/${shape}: ${marks} cells marked in one column`).toBeLessThanOrEqual(1);
        expect(
          marks === 0,
          `${key}/${shape}: direction ${improved!.direction} disagrees with ${marks} marks`,
        ).toBe(improved!.direction === "same");
      }
    }
  });

  it("offers a rerun only once a card is chosen, and keeps the table whole", () => {
    const { document, click } = setup();
    const rerun = document.querySelector('[data-testid="improve-rerun"]') as HTMLButtonElement;
    expect(rerun.disabled, "rerun was live before a card was chosen").toBe(true);

    click("finding-card-quick");
    expect(rerun.disabled, "rerun stayed disabled after choosing").toBe(false);

    for (let press = 0; press < 3; press++) {
      click("improve-rerun");
      const columns = readTable(document);
      expect(columns.map((column) => column.shape), `press ${press}: the table changed shape`).toEqual(
        SHAPE_KEYS,
      );
      for (const column of columns) {
        const parts = column.improved!.note!.split("/").map((part) => Number(part.trim()));
        expect(parts.reduce((a, b) => a + b, 0), `press ${press}: ${column.shape} lost an array`).toBe(20);
      }
    }
  });

  // Amendment 6 keeps Amendment 4's rule: a control that appears to change a
  // table showing every value of the thing it controls is a lie about the table.
  it("leaves the comparison alone when the starting shape changes", () => {
    const { dom, document, click } = setup();
    click("finding-card-bubble");
    const before = JSON.stringify(readTable(document));

    const shapeSelect = document.querySelector('[data-testid="shape-select"]') as HTMLSelectElement;
    shapeSelect.value = "nearlyReversed";
    shapeSelect.dispatchEvent(new dom.window.Event("change", { bubbles: true }));

    expect(JSON.stringify(readTable(document)), "the selector redrew the comparison").toBe(before);
  });

  it("still animates a race after the comparison has run", () => {
    const { document, click, counter } = setup();
    click("finding-card-merge");
    click("improve-rerun");

    click("improve-race");
    vi.runAllTimers();
    for (const side of ["original", "improved"]) {
      const panel = document.querySelector(`[data-testid="improve-panel-${side}"]`) as HTMLElement;
      expect(panel.dataset.sorted, `${side} did not finish after a comparison run`).toBe("true");
      expect(counter(side), `${side} counted nothing after a comparison run`).toBeGreaterThan(0);
    }
  });

  // The local slider is the point of Amendment 6's speed change: it has to be the
  // one this race obeys, not the main race's slider far above it.
  it("takes its speed from its own slider, not the main one", () => {
    const { document, click, counter } = setup();
    const main = document.querySelector('[data-testid="speed-slider"]') as HTMLInputElement;
    const local = document.querySelector('[data-testid="improve-speed"]') as HTMLInputElement;

    // Bubble sort counts a comparison on every frame, so its counter measures how
    // many steps were scheduled in the time advanced.
    click("finding-card-bubble");
    main.value = "50";
    local.value = "2";
    click("improve-race");
    vi.advanceTimersByTime(1000);
    const slow = counter("original");
    vi.runAllTimers();

    click("finding-card-bubble");
    main.value = "2";
    local.value = "50";
    click("improve-race");
    vi.advanceTimersByTime(1000);
    const fast = counter("original");
    vi.runAllTimers();

    expect(fast, `local slider ignored: ${slow} comparisons slow, ${fast} fast`).toBeGreaterThan(slow);
  });

  it("keeps running when its own slider moves mid-race", () => {
    const { document, click, counter } = setup();
    click("finding-card-insertion");
    click("improve-race");
    vi.advanceTimersByTime(200);

    const local = document.querySelector('[data-testid="improve-speed"]') as HTMLInputElement;
    local.value = "50";
    vi.runAllTimers();

    for (const side of ["original", "improved"]) {
      const panel = document.querySelector(`[data-testid="improve-panel-${side}"]`) as HTMLElement;
      expect(panel.dataset.sorted, `${side} stalled when the speed changed`).toBe("true");
      expect(counter(side), `${side} counted nothing`).toBeGreaterThan(0);
    }
  });
});

/*
 * The in-place colour (PLAN.md Amendment 8). "Green means this bar holds the
 * value the sorted array holds at its index" is a claim about every frame, so it
 * is checked on every frame -- of every algorithm, on every shape, in both races.
 * A still of one frame proves nothing here: the interesting failures are the ones
 * one frame either side of a correct-looking picture.
 */
describe("the in-place colour", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // What the colour claims, read straight off the rendered bars. Returns the
  // marked indices and the indices that SHOULD be marked, so a failure can name
  // both instead of just saying "false".
  const inspect = (container: Element) => {
    const bars = [...container.querySelectorAll<HTMLElement>(".bar")];
    const values = bars.map((bar) => Number(bar.dataset.value));
    const sorted = [...values].sort((a, b) => a - b);
    // A bar being compared or used as a pivot right now shows THAT instead: the
    // highlight the reader needs is the one about the current step. Computed from
    // the roles the page actually set, and then held OUT of what green must cover
    // -- deriving "should be green" from the green role itself would make this
    // assertion agree with any implementation at all.
    const busy = new Set(
      bars.flatMap((bar, index) =>
        bar.dataset.role === "compared" || bar.dataset.role === "pivot" ? [index] : [],
      ),
    );
    return {
      values,
      busy: [...busy],
      green: bars.flatMap((bar, index) => (bar.dataset.role === "in-place" ? [index] : [])),
      shouldBeGreen: values.flatMap((value, index) =>
        value === sorted[index] && !busy.has(index) ? [index] : [],
      ),
    };
  };

  // Steps one frame at a time rather than running all the timers: the claim is
  // about the frames, and vi.runAllTimers() would only ever show the last one.
  const eachFrame = (
    document: Document,
    containers: string[],
    check: (frame: number, where: string, seen: ReturnType<typeof inspect>) => void,
  ) => {
    let frame = 0;
    while (vi.getTimerCount() > 0 && frame < 2000) {
      for (const testid of containers) {
        check(frame, testid, inspect(document.querySelector(`[data-testid="${testid}"]`)!));
      }
      vi.advanceTimersToNextTimer();
      frame++;
    }
    return frame;
  };

  for (const shape of SHAPE_KEYS) {
    it(`the main race marks exactly the in-place bars, every frame, on ${shape} input`, () => {
      for (const a of ALGORITHM_KEYS) {
        const dom = new JSDOM(RACE_HTML);
        const { document } = dom.window;
        initRace(document);

        const shapeSelect = document.querySelector('[data-testid="shape-select"]') as HTMLSelectElement;
        shapeSelect.value = shape;
        shapeSelect.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
        (document.querySelector('[data-testid="algorithm-select-a"]') as HTMLSelectElement).value = a;
        document
          .querySelector('[data-testid="race-button"]')!
          .dispatchEvent(new dom.window.Event("click", { bubbles: true }));

        const frames = eachFrame(document, ["bars-a"], (frame, where, seen) => {
          expect(
            seen.green,
            `${a}/${shape} ${where} frame ${frame}: green is [${seen.green}] but in place is [${seen.shouldBeGreen}] (busy [${seen.busy}]) for [${seen.values}]`,
          ).toEqual(seen.shouldBeGreen);
        });
        expect(frames, `${a}/${shape}: the race produced no frames`).toBeGreaterThan(1);

        // And the end state is every bar in place, which is what makes the
        // whole-panel green at the finish a consequence of the same rule rather
        // than a second, unrelated signal.
        const finished = inspect(document.querySelector('[data-testid="bars-a"]')!);
        expect(
          finished.values,
          `${a}/${shape}: the finished panel is not sorted`,
        ).toEqual([...finished.values].sort((x, y) => x - y));
        expect(
          finished.green.length,
          `${a}/${shape}: finished with only ${finished.green.length} bars marked in place`,
        ).toBe(finished.values.length);
      }
    });
  }

  for (const shape of SHAPE_KEYS) {
    it(`the improvement race marks exactly the in-place bars, every frame, on ${shape} input`, () => {
      for (const key of ALGORITHM_KEYS) {
        const dom = new JSDOM(RACE_HTML);
        const { document } = dom.window;
        initRace(document);

        const shapeSelect = document.querySelector('[data-testid="shape-select"]') as HTMLSelectElement;
        shapeSelect.value = shape;
        shapeSelect.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
        for (const testid of [`finding-card-${key}`, "improve-race"]) {
          document
            .querySelector(`[data-testid="${testid}"]`)!
            .dispatchEvent(new dom.window.Event("click", { bubbles: true }));
        }

        // Both sides, because "consistently in both races" includes the improved
        // variant -- and the improved generators are the newer code.
        const sides = ["improve-bars-original", "improve-bars-improved"];
        const frames = eachFrame(document, sides, (frame, where, seen) => {
          expect(
            seen.green,
            `${key}/${shape} ${where} frame ${frame}: green is [${seen.green}] but in place is [${seen.shouldBeGreen}] (busy [${seen.busy}]) for [${seen.values}]`,
          ).toEqual(seen.shouldBeGreen);
        });
        expect(frames, `${key}/${shape}: the improvement race produced no frames`).toBeGreaterThan(1);

        for (const testid of sides) {
          const finished = inspect(document.querySelector(`[data-testid="${testid}"]`)!);
          expect(finished.values, `${key}/${shape} ${testid}: not sorted at the end`).toEqual(
            [...finished.values].sort((x, y) => x - y),
          );
          expect(
            finished.green.length,
            `${key}/${shape} ${testid}: finished with only ${finished.green.length} bars marked`,
          ).toBe(finished.values.length);
        }
      }
    });
  }

  // The regression is not a bug -- it is bubble sort pushing a value back out of
  // place, and seeing that happen is worth more than a monotone colour. But it is
  // the cost of option A, so it is pinned here rather than left as a surprise: if
  // a future change made the mark monotone, this test says so out loud instead of
  // the page quietly starting to claim more than it can.
  it("lets a bar lose the mark again, which is why the key says it can still move", () => {
    const dom = new JSDOM(RACE_HTML);
    const { document } = dom.window;
    initRace(document);

    const shapeSelect = document.querySelector('[data-testid="shape-select"]') as HTMLSelectElement;
    shapeSelect.value = "nearlyReversed";
    shapeSelect.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    (document.querySelector('[data-testid="algorithm-select-a"]') as HTMLSelectElement).value = "bubble";
    document
      .querySelector('[data-testid="race-button"]')!
      .dispatchEvent(new dom.window.Event("click", { bubbles: true }));

    // A bar that was green stays *remembered* through the frames where it is amber
    // or violet, and only counts as regressed once it is neither green nor busy.
    //
    // I first wrote this forgetting an index the moment it went amber, and it found
    // zero regressions for every algorithm and shape -- which is a real finding, not
    // a broken test: bubble and insertion only move a value at the two indices they
    // just compared, so a bar there is amber on the very frame its value leaves its
    // final place. Green never turns straight to blue. It goes green -> amber ->
    // blue, and that is still the reader watching the mark come off, so forgetting
    // across the amber frame measured the wrong thing.
    const everGreen = new Set<number>();
    let regressions = 0;
    eachFrame(document, ["bars-a"], (_frame, _where, seen) => {
      const green = new Set(seen.green);
      const busy = new Set(seen.busy);
      for (const index of everGreen) {
        if (!green.has(index) && !busy.has(index)) {
          regressions++;
          everGreen.delete(index);
        }
      }
      for (const index of green) everGreen.add(index);
    });

    // Measured off the generators at 6.5 per run for bubble on nearly-reversed
    // input, in 100% of 400 runs (5.0 per run, also 100%, on random), so 1 is a
    // floor with a wide margin rather than a coin flip.
    expect(
      regressions,
      "no bar ever lost the in-place mark -- either the mark went monotone or this input stopped being nearly reversed",
    ).toBeGreaterThan(0);
  });
});

// The tests above run against a fixture. This one runs against the file that
// gets deployed, so a testid renamed in one place and not the other is a failure
// here rather than a section that silently never initialises in the browser.
describe("the shipped index.html", () => {
  const html = readFileSync(resolve("index.html"), "utf8");

  it("carries the markup the race needs, and exactly one improvement area", () => {
    const dom = new JSDOM(html);
    const { document } = dom.window;
    expect(() => initRace(document)).not.toThrow();

    expect(document.querySelectorAll('[data-testid="improve-area"]').length).toBe(1);
    expect(document.querySelectorAll('[data-testid="finding-cards"]').length).toBe(1);
    expect(document.querySelectorAll('[data-testid="finding-cards"] button').length).toBe(
      ALGORITHM_KEYS.length,
    );
    expect(document.querySelectorAll('[data-testid^="improve-bars-"]').length).toBe(2);

    // One comparison table and one rerun button, for the same reason as one
    // improvement area: two of either and a reader cannot tell which card's
    // numbers they are reading.
    expect(document.querySelectorAll('[data-testid="improve-stats"]').length).toBe(1);
    expect(document.querySelectorAll('[data-testid="improve-rerun"]').length).toBe(1);

    // Two sliders, one per race. The improvement race got its own rather than
    // borrowing the main one (Amendment 6), so the count is the contract.
    expect(document.querySelectorAll('[data-testid="improve-speed"]').length).toBe(1);
    expect(document.querySelectorAll('input[type="range"]').length).toBe(2);
    for (const input of document.querySelectorAll('input[type="range"]')) {
      const id = input.getAttribute("id")!;
      expect(
        document.querySelector(`label[for="${id}"]`),
        `the ${id} slider has no label pointing at it`,
      ).toBeTruthy();
    }
  });

  // Amendment 8: the page's story is four steps, and the four headings ARE the
  // story. Asserted as an exact ordered list rather than as "contains", because
  // an extra h2 or a reordering is exactly the failure this is here to catch --
  // before the change the two panel titles were h2s sitting between the sections.
  it("tells the story in four section headings, with everything else below them", () => {
    const dom = new JSDOM(html);
    const { document } = dom.window;

    expect(
      [...document.querySelectorAll("main h2")].map((h) => h.textContent!.trim()),
      "the four section headings are not Race / Statistics / What we found / Improvements",
    ).toEqual(["Race", "Statistics", "What we found", "Improvements"]);

    expect(document.querySelectorAll("main h1").length, "more than one page title").toBe(1);

    // Nothing inside a section may compete with its heading. The two race panels
    // were h2s until this amendment, which made "Side A" a sibling of "Statistics"
    // in the document outline.
    for (const selector of [".panel h2", ".improve h2"]) {
      expect(
        document.querySelectorAll(selector).length,
        `${selector}: a nested heading is at section level`,
      ).toBe(0);
    }
    expect(
      [...document.querySelectorAll(".race .panel h3")].map((h) => h.textContent!.trim()),
      "the race panels are not h3 titles",
    ).toEqual(["Side A", "Side B"]);
  });

  // Amendment 9: Home is gone and the title is the top of the page. The <nav>
  // itself stays because spec/invariants.test.ts requires a navigation landmark,
  // so this asserts the landmark is REAL -- links that go somewhere, and none of
  // them pointing at the page you are already on. A hidden or empty nav would
  // pass the invariant and fail this, which is the point of writing it.
  it("opens on the title, with a navigation landmark that goes somewhere", () => {
    const dom = new JSDOM(html);
    const { document } = dom.window;

    const main = document.querySelector("main")!;
    expect(
      main.firstElementChild!.tagName,
      "something sits above the page title inside main",
    ).toBe("H1");
    expect(main.firstElementChild!.textContent!.trim()).toBe("Sorting race");
    expect(document.querySelector("header"), "the old header is still in the page").toBeNull();

    const navs = [...document.querySelectorAll("nav")];
    expect(navs.length, "not exactly one navigation landmark").toBe(1);
    const links = [...navs[0].querySelectorAll("a")];
    expect(links.length, "the nav has no links in it").toBeGreaterThan(1);
    for (const link of links) {
      const text = link.textContent!.trim();
      expect(text, "the Home link is still in the nav").not.toBe("Home");
      expect(text.length, "a nav link with no text").toBeGreaterThan(0);

      // Every link resolves to a section that exists. A nav pointing at a
      // missing id is the same dead end as a broken external link, and the
      // links check in CI does not look at fragments.
      const href = link.getAttribute("href")!;
      expect(href, `nav link "${text}" is not an in-page link`).toMatch(/^#/);
      expect(
        document.querySelector(href),
        `nav link "${text}" points at ${href}, which is not in the page`,
      ).toBeTruthy();
    }

    // The nav sits under the title, not above it.
    expect(
      main.firstElementChild!.compareDocumentPosition(navs[0]) & 4,
      "the nav is above the page title",
    ).toBeGreaterThan(0);
  });

  // Both re-roll buttons say the same thing, because they do the same thing.
  it('calls both re-roll buttons "New array"', () => {
    const dom = new JSDOM(html);
    const { document } = dom.window;
    for (const testid of ["shuffle-button", "improve-shuffle"]) {
      expect(
        document.querySelector(`[data-testid="${testid}"]`)!.textContent!.trim(),
        `${testid} does not say New array`,
      ).toBe("New array");
    }
    expect(html, "New start is still in the page").not.toContain("New start");
  });

  // Amendment 9's second Starting data selector, in the shipped page rather than
  // in the fixture: labelled, in the improvement race's own controls row, and
  // disabled at load like the rest of them.
  it("gives the improvement race its own labelled starting-data selector", () => {
    const dom = new JSDOM(html);
    const { document } = dom.window;

    const selects = [...document.querySelectorAll("select[data-testid$='shape-select']")];
    expect(selects.length, "not exactly two starting-data selectors").toBe(2);
    for (const select of selects) {
      const id = select.getAttribute("id")!;
      expect(
        document.querySelector(`label[for="${id}"]`)?.textContent?.trim(),
        `the ${id} selector is not labelled "Starting data"`,
      ).toBe("Starting data");
    }

    const improve = document.querySelector('[data-testid="improve-shape-select"]')!;
    expect(
      improve.closest(".improve .controls"),
      "the improvement selector is not in the improvement race's controls row",
    ).toBeTruthy();
    expect(improve.hasAttribute("disabled"), "the improvement selector ships unlocked").toBe(true);

    // The sentence it replaced is gone -- it named one shape, and the reader can
    // now choose any of the three.
    expect(html, "the fixed shape sentence is still in the page").not.toContain("improve-shape\"");
  });

  // Amendment 10a. A table of four number columns has a width it cannot go below,
  // and the improvement one sits two boxes deep, so at 390px it was 16px wider
  // than its slot and drew outside the white card. The CSS brings it down to fit;
  // this asserts the floor underneath that -- both tables live in a box that can
  // scroll -- because the CSS fit is a measurement that a future font change or a
  // longer variant label could quietly break, and JSDOM cannot measure anything.
  // What it CAN check is that the escape hatch is still wired up.
  it("keeps both statistics tables in a box that can scroll", () => {
    const dom = new JSDOM(html);
    const { document } = dom.window;
    const tables = [...document.querySelectorAll("table.matrix")];

    expect(tables.length, "expected the two statistics tables").toBe(2);
    for (const table of tables) {
      expect(
        table.parentElement?.classList.contains("table-scroll"),
        `a .matrix table is not wrapped in .table-scroll (${table.getAttribute("data-testid") ?? "stats"})`,
      ).toBe(true);
    }
  });

  // The findings section holds the discoveries; the improvements section holds the
  // fixes and the race. Keeping them apart is the page-level half of "finding
  // first, then the proposed improvement".
  it("keeps the findings section free of the improvement race", () => {
    const dom = new JSDOM(html);
    const { document } = dom.window;
    const findings = document.querySelector(".findings")!;

    expect(findings.querySelector('[data-testid="finding-cards"]'), "the cards are not in Findings").toBeTruthy();
    expect(
      findings.querySelector('[data-testid="improve-area"]'),
      "the improvement race is still inside the findings section",
    ).toBeNull();
    expect(
      document.querySelector('#improve [data-testid="improve-area"]'),
      "#improve does not contain the improvement race",
    ).toBeTruthy();
  });

  // Both races draw with the same renderBars, so the key has to appear beside
  // both -- a colour without a key is decoration. Amendment 8's brief said
  // "consistently in both the main and improvement races"; this is that word.
  it("gives both races the same three-colour key", () => {
    const dom = new JSDOM(html);
    const { document } = dom.window;
    const legends = [...document.querySelectorAll(".legend")];
    expect(legends.length, "not one key per race").toBe(2);

    for (const legend of legends) {
      expect(
        [...legend.querySelectorAll("span[data-role]")].map((span) =>
          (span as HTMLElement).dataset.role,
        ),
        "a race's key does not name all three highlight colours",
      ).toEqual(["compared", "pivot", "in-place"]);
    }

    // The honest wording, not "sorted": the measurement says a bar takes this
    // colour and loses it again about five times a run for bubble and insertion
    // on random input, so the key must not promise the bar is finished.
    for (const legend of legends) {
      const text = legend.querySelector('span[data-role="in-place"]')!.textContent!;
      expect(text, "the in-place key promises more than the colour means").toContain("can still move");
    }
  });

  // The findings section is what the statistics paragraph now points at.
  it("links the corrected bubble-sort claim to the section that races it", () => {
    const dom = new JSDOM(html);
    const { document } = dom.window;
    const detail = document.querySelector("#variant-detail")!;
    const target = detail.querySelector('a[href^="#"]')!.getAttribute("href")!;
    expect(document.querySelector(target), `${target} is not on the page`).toBeTruthy();
    expect(document.querySelector(target)!.querySelector('[data-testid="improve-area"]')).toBeTruthy();
  });
});
