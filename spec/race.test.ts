import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import { initRace } from "../src/race";
import { SORT_ALGORITHMS, shuffledRange } from "../src/sorting";

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
  ${PANEL_MARKUP("a")}
  ${PANEL_MARKUP("b")}
</body>`;

describe("each sort algorithm", () => {
  for (const [key, algorithm] of Object.entries(SORT_ALGORITHMS)) {
    it(`${key}: sorts the array and counts at least one comparison`, () => {
      const input = shuffledRange(16);
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
      const input = shuffledRange(16);
      const expected = [...input].sort((a, b) => a - b);
      const generator = algorithm(input);

      let frame = 0;
      let result = generator.next();
      while (true) {
        const actual = [...result.value.array].sort((a, b) => a - b);
        expect(
          actual,
          `${key} frame ${frame} is not a permutation of the input: [${result.value.array.join(", ")}]`,
        ).toEqual(expected);
        if (result.done) break;
        frame++;
        result = generator.next();
      }

      expect(frame, `${key} yielded no intermediate frames`).toBeGreaterThan(0);
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
});
