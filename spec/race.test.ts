import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import { initRace } from "../src/race";
import {
  IMPROVED_ALGORITHMS,
  IMPROVEMENTS,
  INPUT_SHAPES,
  SORT_ALGORITHMS,
  comparisonStats,
  countComparisons,
  countVariantComparisons,
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
    <p data-testid="improve-finding"></p>
    <p data-testid="improve-change"></p>
    <button type="button" data-testid="improve-shuffle" disabled></button>
    <button type="button" data-testid="improve-race" disabled></button>
    <span data-testid="improve-shape"></span>
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
    return { dom, document, click, barValues, counter };
  };

  it("offers one card per algorithm, each naming its finding and its improvement", () => {
    const { document } = setup();
    const cards = [...document.querySelectorAll('[data-testid="finding-cards"] button')];

    expect(cards.length, "one card per algorithm").toBe(ALGORITHM_KEYS.length);
    for (const key of ALGORITHM_KEYS) {
      const card = cards.find((button) => (button as HTMLElement).dataset.algorithm === key);
      expect(card, `no card for ${key}`).toBeTruthy();
      expect(card!.textContent, `card for ${key} omits its improvement`).toContain(
        IMPROVEMENTS[key].label,
      );
      expect(card!.textContent, `card for ${key} omits its finding`).toContain(IMPROVEMENTS[key].finding);
    }
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

  // No second shape selector: the improvement race reads the same control the
  // main race does, so the two are always asking about the same condition.
  it("takes its starting shape from the existing selector", () => {
    const { dom, document, click, barValues } = setup();
    const shapeSelect = document.querySelector('[data-testid="shape-select"]') as HTMLSelectElement;
    click("finding-card-quick");

    shapeSelect.value = "nearlySorted";
    shapeSelect.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    const ordered = barValues("original");
    expect(ordered, "the two sides diverged on a shape change").toEqual(barValues("improved"));
    expect(inversions(ordered), `not nearly sorted: ${ordered.join(", ")}`).toBeLessThanOrEqual(40);

    expect(
      document.querySelector('[data-testid="improve-shape"]')!.textContent,
      "the area does not say which shape it is racing",
    ).toContain("nearly sorted");
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

  it("locks the shape selector while it is racing, and unlocks it afterwards", () => {
    const { document, click } = setup();
    const shapeSelect = document.querySelector('[data-testid="shape-select"]') as HTMLSelectElement;
    click("finding-card-merge");
    expect(shapeSelect.disabled, "selector was locked before any race").toBe(false);

    click("improve-race");
    expect(shapeSelect.disabled, "the condition was changeable mid-race").toBe(true);
    vi.runAllTimers();
    expect(shapeSelect.disabled, "selector stayed locked after the race").toBe(false);
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
