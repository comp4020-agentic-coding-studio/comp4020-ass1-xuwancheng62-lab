import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import { initRace } from "../src/race";
import {
  INPUT_SHAPES,
  SORT_ALGORITHMS,
  comparisonStats,
  countComparisons,
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
    <tbody data-testid="stats-body"></tbody>
  </table>
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

  // The shape is one experimental condition shared by both halves of the page,
  // so selecting it has to reach the race and the statistics alike -- and it has
  // to clear statistics measured under the previous condition, because numbers
  // from one shape sitting under a caption naming another is exactly the false
  // claim this control exists to expose.
  it("sends the selected shape to both the race and the statistics", () => {
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
    expect(document.querySelectorAll('[data-testid="stats-body"] tr').length).toBeGreaterThan(0);

    shapeSelect.value = "nearlySorted";
    shapeSelect.dispatchEvent(new dom.window.Event("change", { bubbles: true }));

    expect(
      document.querySelectorAll('[data-testid="stats-body"] tr').length,
      "statistics from the previous shape were left on screen",
    ).toBe(0);
    expect(document.querySelector('[data-testid="stats-scope"]')!.textContent).toContain(
      "nearly-sorted",
    );

    // The race got the new shape too, not just the caption: a nearly-sorted
    // array of 16 is measurably ordered where a random one is not.
    const bars = [...document.querySelectorAll('[data-testid="bars-a"] .bar')].map((bar) =>
      Number((bar as HTMLElement).dataset.value),
    );
    expect(inversions(bars), `race array was not nearly sorted: ${bars.join(", ")}`).toBeLessThanOrEqual(40);

    document
      .querySelector('[data-testid="stats-button"]')!
      .dispatchEvent(new dom.window.Event("click", { bubbles: true }));
    expect(document.querySelector('[data-testid="stats-scope"]')!.textContent).toContain(
      "nearly-sorted",
    );
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

  it("fills the statistics table with one row per algorithm when asked", () => {
    const dom = new JSDOM(RACE_HTML);
    const { document } = dom.window;
    initRace(document);

    document
      .querySelector('[data-testid="stats-button"]')!
      .dispatchEvent(new dom.window.Event("click", { bubbles: true }));

    const rows = [...document.querySelectorAll('[data-testid="stats-body"] tr')];
    expect(rows.length, "one row per algorithm").toBe(Object.keys(SORT_ALGORITHMS).length);
    for (const key of Object.keys(SORT_ALGORITHMS)) {
      const cell = document.querySelector(`[data-testid="stats-average-${key}"]`);
      expect(cell, `no average reported for ${key}`).toBeTruthy();
      expect(Number(cell!.textContent), `${key} average is not a positive number`).toBeGreaterThan(0);
    }
    expect(
      document.querySelectorAll('[data-testid="stats-body"] tr[data-fewest="true"]').length,
      "no row marked as using the fewest comparisons",
    ).toBeGreaterThan(0);
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
