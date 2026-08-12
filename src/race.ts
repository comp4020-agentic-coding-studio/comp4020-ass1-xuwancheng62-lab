import {
  ALGORITHM_LABELS,
  ALGORITHM_VARIANTS,
  IMPROVED_ALGORITHMS,
  IMPROVEMENTS,
  INPUT_SHAPES,
  SHAPE_LABELS,
  SORT_ALGORITHMS,
  averageDirection,
  comparisonStats,
  improvementComparison,
  shapeSample,
  type AlgorithmKey,
  type ShapeKey,
  type SortStep,
} from "./sorting";

const ARRAY_LENGTH = 16;
// 100ms: a highlighted comparison needs to stay on screen long enough to read
// as "those two, specifically". Now the slider's default rather than a fixed
// value -- 10 steps per second.
const DEFAULT_STEP_MS = 100;
const STATS_RUNS = 20;
const PANEL_IDS = ["a", "b"] as const;
type PanelId = (typeof PANEL_IDS)[number];

// Both lists come from the sorting module rather than being restated here, so
// the statistics matrix gains a row or a column by registering an algorithm or a
// shape there -- nothing in this file needs to know how many of either there are.
const ALGORITHM_KEYS = Object.keys(SORT_ALGORITHMS) as AlgorithmKey[];
const SHAPE_KEYS = Object.keys(INPUT_SHAPES) as ShapeKey[];

interface PanelRefs {
  section: HTMLElement;
  select: HTMLSelectElement;
  bars: HTMLElement;
  counter: HTMLElement;
}

function getPanelRefs(root: ParentNode, id: PanelId): PanelRefs {
  const section = root.querySelector<HTMLElement>(`[data-testid="panel-${id}"]`);
  const select = root.querySelector<HTMLSelectElement>(`[data-testid="algorithm-select-${id}"]`);
  const bars = root.querySelector<HTMLElement>(`[data-testid="bars-${id}"]`);
  const counter = root.querySelector<HTMLElement>(`[data-testid="counter-${id}"]`);
  if (!section || !select || !bars || !counter) {
    throw new Error(`race panel "${id}" is missing required markup`);
  }
  return { section, select, bars, counter };
}

function renderBars(
  container: HTMLElement,
  values: number[],
  max: number,
  marks: Pick<SortStep, "compared" | "pivot"> = {},
): void {
  const document = container.ownerDocument;
  // Where each value BELONGS. Every frame is a permutation of the array the sort
  // started from (asserted in spec/race.test.ts), so sorting this frame gives
  // the same answer as sorting the input -- which is why the in-place mark needs
  // no extra argument and works identically in both races and all four
  // algorithms (PLAN.md Amendment 8, option A).
  const sorted = [...values].sort((a, b) => a - b);
  container.replaceChildren(
    ...values.map((value, index) => {
      const bar = document.createElement("div");
      bar.className = "bar";
      bar.dataset.value = String(value);
      bar.style.height = `${(value / max) * 100}%`;
      // data-role picks the highlight colour in styles.css. Pivot is checked
      // first so quick sort's pivot keeps its own colour even though it is also
      // one of the two values being compared; the in-place green is checked last
      // so a bar being looked at right now still shows as such.
      //
      // "In its final place" is a fact about THIS frame, not a promise: a bar can
      // take the green and lose it again, ~5 times a run for bubble and insertion
      // on random input, and on nearly-sorted input about seven of sixteen bars
      // are green before the first comparison. That is the input being nearly
      // sorted, which is the thing the page is about, so the legend says "it can
      // still move" rather than claiming the bar is done.
      if (marks.pivot === index) {
        bar.dataset.role = "pivot";
      } else if (marks.compared?.includes(index)) {
        bar.dataset.role = "compared";
      } else if (value === sorted[index]) {
        bar.dataset.role = "in-place";
      }
      return bar;
    }),
  );
}

export function initRace(root: ParentNode): void {
  const document = root.ownerDocument ?? (root as Document);
  const panels = { a: getPanelRefs(root, "a"), b: getPanelRefs(root, "b") };
  const shuffleButton = root.querySelector<HTMLButtonElement>('[data-testid="shuffle-button"]');
  const raceButton = root.querySelector<HTMLButtonElement>('[data-testid="race-button"]');
  const speedSlider = root.querySelector<HTMLInputElement>('[data-testid="speed-slider"]');
  const shapeSelect = root.querySelector<HTMLSelectElement>('[data-testid="shape-select"]');
  const statsButton = root.querySelector<HTMLButtonElement>('[data-testid="stats-button"]');
  const statsHead = root.querySelector<HTMLElement>('[data-testid="stats-head"]');
  const statsBody = root.querySelector<HTMLElement>('[data-testid="stats-body"]');
  const statsScope = root.querySelector<HTMLElement>('[data-testid="stats-scope"]');
  if (
    !shuffleButton ||
    !raceButton ||
    !speedSlider ||
    !shapeSelect ||
    !statsButton ||
    !statsHead ||
    !statsBody ||
    !statsScope
  ) {
    throw new Error("race controls are missing required markup");
  }

  let sharedArray: number[] = [];
  let racing = false;

  // The slider is read at schedule time rather than captured when the race
  // starts, which is what lets it take effect mid-race without restarting
  // anything. Its value is steps per second, so dragging right is faster.
  function currentStepMs(): number {
    const rate = Number(speedSlider!.value);
    return Number.isFinite(rate) && rate > 0 ? 1000 / rate : DEFAULT_STEP_MS;
  }

  function currentShape(): ShapeKey {
    return shapeSelect!.value as ShapeKey;
  }

  // One array per press, handed to both panels, so the two algorithms are
  // always compared on identical data -- the shape select only changes which
  // kind of array gets made here.
  function newStart(): void {
    if (racing) return;
    sharedArray = INPUT_SHAPES[currentShape()](ARRAY_LENGTH);
    for (const panel of Object.values(panels)) {
      renderBars(panel.bars, sharedArray, ARRAY_LENGTH);
      panel.counter.textContent = "0";
      delete panel.section.dataset.sorted;
      delete panel.section.dataset.winner;
    }
  }

  // Every shape, always, so the sentence matches the table's three columns.
  // Amendment 4: this used to name only the selected shape, back when the table
  // showed one condition at a time. Amendment 7 stopped it listing the three
  // shapes by name -- they are the column headings a centimetre above it, and
  // spelling them out ran this caption to eight lines on a phone. The array
  // length stays: it is stated nowhere else, and it is the limit on the claim.
  // Amendment 8 folded "the identical 20 to all four algorithms" in here, out of
  // the static caption: it is the same fact, and it belongs with the sample size
  // rather than as its own sentence three lines further down.
  function describeStatsScope(): void {
    statsScope!.textContent = `${STATS_RUNS} arrays of each shape, every array ${ARRAY_LENGTH} items long — the identical ${STATS_RUNS} to all four algorithms.`;
  }

  // The selector is the race's condition only. It deliberately leaves the
  // statistics alone: under Amendment 3 it cleared them, because the table then
  // showed the selected shape and stale numbers would have sat under a caption
  // naming a different one. The table now names all three itself, so there is
  // no mismatch to prevent -- see PLAN.md Amendment 4.
  function changeShape(): void {
    if (racing) return;
    newStart();
    // Amendment 5: the improvement race takes its condition from this same
    // selector rather than adding a second one, so it gets a fresh array of the
    // new shape too (a no-op until a finding has been chosen).
    describeImproveShape();
    newImproveArray();
  }

  // Pulls one comparison at a time from the algorithm's generator, redraws,
  // then schedules the next pull with setTimeout so both panels animate
  // side by side instead of one sort finishing before the other starts.
  function runPanel(panel: PanelRefs, algorithm: AlgorithmKey, onDone: (comparisons: number) => void): void {
    const generator = SORT_ALGORITHMS[algorithm]([...sharedArray]);

    function step(): void {
      const result = generator.next();
      renderBars(panel.bars, result.value.array, ARRAY_LENGTH, result.value);
      panel.counter.textContent = String(result.value.comparisons);
      if (result.done) {
        panel.section.dataset.sorted = "true";
        onDone(result.value.comparisons);
        return;
      }
      setTimeout(step, currentStepMs());
    }
    step();
  }

  function race(): void {
    if (racing || sharedArray.length === 0) return;
    racing = true;
    shuffleButton!.disabled = true;
    raceButton!.disabled = true;
    statsButton!.disabled = true;
    // The shape is the experimental condition, so it is locked for the duration
    // of the race. Only the speed slider stays live. Amendment 5: the lock is
    // shared with the improvement race below, hence syncShapeLock rather than a
    // straight assignment -- either race running keeps the selector disabled.
    syncShapeLock();
    const totals = new Map<PanelId, number>();

    for (const panel of Object.values(panels)) {
      delete panel.section.dataset.sorted;
      delete panel.section.dataset.winner;
    }

    for (const id of PANEL_IDS) {
      const panel = panels[id];
      const algorithm = panel.select.value as AlgorithmKey;
      runPanel(panel, algorithm, (comparisons) => {
        totals.set(id, comparisons);
        if (totals.size < PANEL_IDS.length) return;

        // The winner is whoever used the fewest comparisons, not whoever
        // finished animating first. Frame count differs from comparison count
        // (merge and quick emit frames that compare nothing), so the two
        // disagreed on about a fifth of merge-vs-quick races -- see PLAN.md
        // Amendment 2. A tie marks both rather than inventing a tiebreak.
        const fewest = Math.min(...totals.values());
        for (const [panelId, count] of totals) {
          if (count === fewest) panels[panelId].section.dataset.winner = "true";
        }

        racing = false;
        shuffleButton!.disabled = false;
        raceButton!.disabled = false;
        statsButton!.disabled = false;
        syncShapeLock();
      });
    }
  }

  /**
   * Amendment 4: one press measures all three shapes and lays them out as a
   * matrix -- algorithms down the side, shapes across the top. Reading down a
   * column gives the ranking under one condition; reading across a row gives one
   * algorithm's response to the shape. The rearrangement is then visible as the
   * highlight moving between columns, instead of something the reader has to
   * hold in memory across three separate runs.
   */
  function runStats(): void {
    // Each shape gets its own sample of the same size, drawn by the same
    // generator. Within a column all four algorithms see the identical 20 arrays
    // (comparisonStats takes the inputs and loops the algorithms inside); between
    // columns the arrays necessarily differ, which is what a shape is.
    const byShape = new Map(
      SHAPE_KEYS.map((shape) => [shape, comparisonStats(shapeSample(shape, ARRAY_LENGTH, STATS_RUNS))]),
    );
    // Fewest per column, not per table: one highlight across twelve cells would
    // read as a single overall winner, which is the opposite of the point.
    const fewestByShape = new Map(
      SHAPE_KEYS.map((shape) => [
        shape,
        Math.min(...byShape.get(shape)!.map((row) => row.averageComparisons)),
      ]),
    );

    describeStatsScope();

    const headerRow = document.createElement("tr");
    const corner = document.createElement("th");
    corner.scope = "col";
    corner.textContent = "Algorithm";
    headerRow.append(corner);
    // Generated from the shape list rather than written into index.html, so a
    // header can't drift out of step with the columns underneath it.
    for (const shape of SHAPE_KEYS) {
      const th = document.createElement("th");
      th.scope = "col";
      th.dataset.shape = shape;
      th.textContent = SHAPE_LABELS[shape];
      headerRow.append(th);
    }
    statsHead!.replaceChildren(headerRow);

    statsBody!.replaceChildren(
      ...ALGORITHM_KEYS.map((algorithm) => {
        const tr = document.createElement("tr");
        tr.dataset.algorithm = algorithm;

        const name = document.createElement("th");
        name.scope = "row";
        name.textContent = ALGORITHM_LABELS[algorithm];
        // Where the number depends on which variant we implemented, the variant
        // is named right here in the row rather than in a footnote, so nobody
        // reads Bubble's flat 120 as a fact about bubble sort in general.
        const variant = ALGORITHM_VARIANTS[algorithm];
        if (variant) {
          const note = document.createElement("small");
          note.textContent = variant;
          name.append(note);
        }
        tr.append(name);

        for (const shape of SHAPE_KEYS) {
          const row = byShape.get(shape)!.find((entry) => entry.algorithm === algorithm)!;
          const cell = document.createElement("td");
          cell.dataset.testid = `stats-cell-${algorithm}-${shape}`;
          if (row.averageComparisons === fewestByShape.get(shape)) cell.dataset.fewest = "true";

          const average = document.createElement("span");
          average.className = "avg";
          average.textContent = row.averageComparisons.toFixed(1);

          // Kept to one short line and never wrapped: at 390px the longer
          // wording broke across two lines in some cells and not others, which
          // made the row heights ragged and killed the across-row scan.
          const wins = document.createElement("small");
          wins.textContent = `${row.fewestWins}/${STATS_RUNS} won`;

          cell.append(average, wins);
          tr.append(cell);
        }
        return tr;
      }),
    );
  }

  /*
   * ------------------------------------------------------------------
   * The improvement race (PLAN.md Amendment 5): four cards, one shared
   * area, original against improved on the identical array.
   * ------------------------------------------------------------------
   */

  function need<T extends HTMLElement>(selector: string): T {
    const found = root.querySelector<T>(selector);
    if (!found) throw new Error(`improvement race markup is missing ${selector}`);
    return found;
  }

  const cardList = need('[data-testid="finding-cards"]');
  const improveTitle = need('[data-testid="improve-title"]');
  // Amendment 8 deleted the line that repeated the chosen card's finding here.
  // The finding is now the card's own main text, and the chosen card sits
  // highlighted a few centimetres above this heading, so restating it was
  // duplication rather than context.
  const improveChange = need('[data-testid="improve-change"]');
  const improveExpect = need('[data-testid="improve-expect"]');
  const improveShapeNote = need('[data-testid="improve-shape"]');
  const improveShuffle = need<HTMLButtonElement>('[data-testid="improve-shuffle"]');
  const improveRaceButton = need<HTMLButtonElement>('[data-testid="improve-race"]');
  const improveSpeed = need<HTMLInputElement>('[data-testid="improve-speed"]');
  const improveRerun = need<HTMLButtonElement>('[data-testid="improve-rerun"]');
  const improveStats = need('[data-testid="improve-stats"]');
  const improveStatsHead = need('[data-testid="improve-stats-head"]');
  const improveStatsBody = need('[data-testid="improve-stats-body"]');
  const improveStatsScope = need('[data-testid="improve-stats-scope"]');
  const improveSides = {
    original: {
      section: need('[data-testid="improve-panel-original"]'),
      bars: need('[data-testid="improve-bars-original"]'),
      counter: need('[data-testid="improve-counter-original"]'),
      variant: need('[data-testid="improve-variant-original"]'),
    },
    improved: {
      section: need('[data-testid="improve-panel-improved"]'),
      bars: need('[data-testid="improve-bars-improved"]'),
      counter: need('[data-testid="improve-counter-improved"]'),
      variant: need('[data-testid="improve-variant-improved"]'),
    },
  };
  const IMPROVE_SIDES = ["original", "improved"] as const;
  type ImproveSide = (typeof IMPROVE_SIDES)[number];

  // Which finding is loaded, or null before the reader picks one. The area's
  // buttons stay disabled while it is null, so "choose a finding first" is a
  // property of the page rather than an instruction that can be ignored.
  let chosen: AlgorithmKey | null = null;
  let improveArray: number[] = [];
  let improveRacing = false;

  // Both races share the one Starting data selector, so the lock has to account
  // for both: whichever is still running keeps it disabled.
  function syncShapeLock(): void {
    shapeSelect!.disabled = racing || improveRacing;
  }

  // This race has its own slider, sitting beside it. Amendment 5 wired it to the
  // main race's slider instead, which worked and was around 1500px above the
  // animation it controlled on a phone -- Amendment 6 supersedes that decision
  // for speed only. Two independent sliders, each next to what it drives, rather
  // than two views of one value that have to be kept in sync.
  function improveStepMs(): number {
    const rate = Number(improveSpeed.value);
    return Number.isFinite(rate) && rate > 0 ? 1000 / rate : DEFAULT_STEP_MS;
  }

  function setImproveControls(): void {
    const ready = chosen !== null && !improveRacing;
    improveShuffle.disabled = !ready;
    improveRaceButton.disabled = !ready;
    // The comparison is 120 sorts of arrays of its own, finished in about a
    // millisecond and touching nothing the animation uses, so it stays available
    // while a race animates.
    improveRerun.disabled = chosen === null;
    for (const button of cardList.querySelectorAll("button")) {
      button.disabled = improveRacing;
    }
  }

  /**
   * The 20-run comparison (PLAN.md Amendment 6). All three shapes at once, one
   * improvement against its own original, so a reader can see the same change
   * help on one shape, do nothing on another and cost comparisons on a third --
   * which one race, on one array, of one shape cannot show.
   */
  function runImproveStats(): void {
    if (chosen === null) return;
    const algorithm = chosen;
    const improvement = IMPROVEMENTS[algorithm];

    // Each shape gets its own sample; within a shape the identical 20 arrays go
    // to both variants, because improvementComparison is handed the arrays and
    // counts both sides from the same one.
    const rows = SHAPE_KEYS.map((shape) => ({
      shape,
      result: improvementComparison(algorithm, shapeSample(shape, ARRAY_LENGTH, STATS_RUNS)),
    }));

    const variant = ALGORITHM_VARIANTS[algorithm] || "ordinary version";
    improveStatsScope.textContent = `${ALGORITHM_LABELS[algorithm]}, ${variant} vs ${improvement.label}: ${STATS_RUNS} arrays of each shape, the same ${STATS_RUNS} to both.`;

    // Which of the two averages is marked in each column, or neither, with a
    // measured tolerance so a difference the size of this sample's own noise
    // reads as no difference (PLAN.md Amendment 7). Rounded to the one decimal
    // the cells print *before* the comparison, so a reader subtracting the two
    // numbers in a column gets the same answer the code did -- which is what the
    // caption's "under 2.5 comparisons apart" promises.
    const columns = new Map(
      rows.map(({ shape, result }) => {
        const printed = {
          original: Number(result.originalAverage.toFixed(1)),
          improved: Number(result.improvedAverage.toFixed(1)),
        };
        return [
          shape,
          {
            printed,
            record: `${result.improvedWins}/${result.ties}/${result.improvedLosses}`,
            direction: averageDirection(printed.original, printed.improved),
          },
        ];
      }),
    );

    // Amendment 8 transposed this table to match the statistics matrix above:
    // shapes across the top, the two variants down the side. The highlight then
    // moves DOWN a column here exactly as it does up there, so both tables are
    // read the same way, and the row headers name the two variants in the same
    // <small> idiom the matrix uses for its algorithms.
    const headerRow = document.createElement("tr");
    const corner = document.createElement("th");
    corner.scope = "col";
    corner.textContent = "Version";
    headerRow.append(corner);
    for (const shape of SHAPE_KEYS) {
      const th = document.createElement("th");
      th.scope = "col";
      th.dataset.shape = shape;
      th.textContent = SHAPE_LABELS[shape];
      headerRow.append(th);
    }
    improveStatsHead.replaceChildren(headerRow);

    const variantRows = [
      { variantKey: "original" as const, label: "Original", note: variant },
      { variantKey: "improved" as const, label: "Improved", note: improvement.label },
    ];

    improveStatsBody.replaceChildren(
      ...variantRows.map(({ variantKey, label, note }) => {
        const tr = document.createElement("tr");
        tr.dataset.variant = variantKey;

        const name = document.createElement("th");
        name.scope = "row";
        name.textContent = label;
        // Which version this row is, beside the numbers it produced -- the same
        // reason the matrix above puts "no early exit" under "Bubble sort".
        const small = document.createElement("small");
        small.textContent = note;
        name.append(small);
        tr.append(name);

        for (const shape of SHAPE_KEYS) {
          const column = columns.get(shape)!;
          const cell = document.createElement("td");
          cell.dataset.testid = `improve-cell-${variantKey}-${shape}`;
          cell.dataset.shape = shape;

          const value = document.createElement("span");
          value.className = "avg";
          value.textContent = column.printed[variantKey].toFixed(1);
          cell.append(value);

          // The win/tied/lost triple appears once per column, under the Improved
          // cell it describes. On the Original row it would be the same three
          // numbers read backwards, which is not a second fact.
          if (variantKey === "improved") {
            const record = document.createElement("small");
            record.textContent = column.record;
            cell.append(record);
            // The column's verdict lives on the cell that carries the change, so
            // a test (and a reader) can ask "what happened on nearly sorted?" of
            // one element rather than of the pair.
            cell.dataset.direction = column.direction;
          }

          if (column.direction === (variantKey === "improved" ? "better" : "worse")) {
            cell.dataset.fewest = "true";
          }
          tr.append(cell);
        }
        return tr;
      }),
    );

    improveStats.dataset.algorithm = algorithm;
  }

  function newImproveArray(): void {
    if (chosen === null || improveRacing) return;
    improveArray = INPUT_SHAPES[currentShape()](ARRAY_LENGTH);
    for (const side of IMPROVE_SIDES) {
      renderBars(improveSides[side].bars, improveArray, ARRAY_LENGTH);
      improveSides[side].counter.textContent = "0";
      delete improveSides[side].section.dataset.sorted;
      delete improveSides[side].section.dataset.winner;
    }
  }

  // The condition, restated inside the area. The reader can change the shape with
  // the selector far above, and a result whose input shape is off-screen is a
  // number without its condition attached.
  function describeImproveShape(): void {
    improveShapeNote.textContent =
      chosen === null
        ? ""
        : `Both sides start from the same ${SHAPE_LABELS[currentShape()].toLowerCase()} array.`;
  }

  function chooseFinding(algorithm: AlgorithmKey): void {
    if (improveRacing) return;
    chosen = algorithm;
    const improvement = IMPROVEMENTS[algorithm];
    // One area, reloaded. Choosing a second card must not leave two races on the
    // page, which is why this writes into the same elements every time.
    improveTitle.textContent = `${ALGORITHM_LABELS[algorithm]} — ${improvement.label}`;
    // "Improved" has to say what was changed, or the reader is being asked to
    // trust a label. This is the one sentence of mechanism.
    improveChange.textContent = `What changed: ${improvement.change}`;
    improveExpect.textContent = improvement.expect(ARRAY_LENGTH);
    improveSides.original.variant.textContent = `(${ALGORITHM_VARIANTS[algorithm] || "ordinary version"})`;
    improveSides.improved.variant.textContent = `(${improvement.label})`;
    const area = need('[data-testid="improve-area"]');
    area.dataset.algorithm = algorithm;
    for (const button of cardList.querySelectorAll<HTMLButtonElement>("button")) {
      const selected = button.dataset.algorithm === algorithm;
      button.dataset.selected = String(selected);
      button.setAttribute("aria-pressed", String(selected));
    }
    setImproveControls();
    describeImproveShape();
    newImproveArray();
    // Automatic, not behind a button: choosing a card is the press. The table is
    // then never an empty frame, and it is rebuilt for the new algorithm rather
    // than leaving the previous card's numbers under this card's heading.
    runImproveStats();
  }

  // Deliberately not reusing runPanel: that one reads the main race's shared
  // array and its algorithm map, and Amendment 5 keeps the main race untouched.
  function runImproveSide(
    side: ImproveSide,
    generate: (input: number[]) => ReturnType<(typeof SORT_ALGORITHMS)[AlgorithmKey]>,
    onDone: (comparisons: number) => void,
  ): void {
    const refs = improveSides[side];
    const generator = generate([...improveArray]);

    function step(): void {
      const result = generator.next();
      renderBars(refs.bars, result.value.array, ARRAY_LENGTH, result.value);
      refs.counter.textContent = String(result.value.comparisons);
      if (result.done) {
        refs.section.dataset.sorted = "true";
        onDone(result.value.comparisons);
        return;
      }
      setTimeout(step, improveStepMs());
    }
    step();
  }

  function improveRace(): void {
    if (chosen === null || improveRacing || improveArray.length === 0) return;
    improveRacing = true;
    setImproveControls();
    syncShapeLock();
    const algorithm = chosen;
    const totals = new Map<ImproveSide, number>();

    for (const side of IMPROVE_SIDES) {
      delete improveSides[side].section.dataset.sorted;
      delete improveSides[side].section.dataset.winner;
    }

    const generators: Record<ImproveSide, (input: number[]) => ReturnType<(typeof SORT_ALGORITHMS)[AlgorithmKey]>> = {
      original: SORT_ALGORITHMS[algorithm],
      improved: IMPROVED_ALGORITHMS[algorithm],
    };

    for (const side of IMPROVE_SIDES) {
      runImproveSide(side, generators[side], (comparisons) => {
        totals.set(side, comparisons);
        if (totals.size < IMPROVE_SIDES.length) return;

        // Fewest comparisons wins, the same definition as the main race. The
        // improved side can lose one it usually wins -- quick sort's random
        // pivot varies run to run -- and that is the honest display of an
        // expected-case improvement, not a result to hide (Amendment 5).
        const fewest = Math.min(...totals.values());
        for (const [name, count] of totals) {
          if (count === fewest) improveSides[name].section.dataset.winner = "true";
        }

        improveRacing = false;
        setImproveControls();
        syncShapeLock();
      });
    }
  }

  for (const algorithm of ALGORITHM_KEYS) {
    const improvement = IMPROVEMENTS[algorithm];
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "card";
    button.dataset.testid = `finding-card-${algorithm}`;
    button.dataset.algorithm = algorithm;
    button.setAttribute("aria-pressed", "false");

    // Amendment 8: the discovery first, the proposal second. Until now the blue
    // improvement label sat directly under the algorithm's name and the finding
    // was the grey afterthought, so the cards read as a menu of fixes. Reversed,
    // they answer "what did we find?" before "what could we change?".
    const heading = document.createElement("strong");
    heading.textContent = ALGORITHM_LABELS[algorithm];
    // Where our implementation is the reason for the finding, the variant is
    // named on the card itself, in the same place and idiom as the statistics
    // table's row headers. Without it "doesn't adapt to its input" reads as a
    // claim about bubble sort rather than about these two fixed loops -- exactly
    // the false implication CLAUDE.md is about. Empty for insertion and merge,
    // which are the ordinary versions.
    const variant = ALGORITHM_VARIANTS[algorithm];
    if (variant) {
      const note = document.createElement("small");
      note.className = "card-variant";
      note.textContent = variant;
      heading.append(note);
    }

    const finding = document.createElement("span");
    finding.className = "card-finding";
    finding.textContent = improvement.finding(ARRAY_LENGTH);

    const label = document.createElement("span");
    label.className = "card-label";
    label.textContent = `Try: ${improvement.label}`;

    button.append(heading, finding, label);
    button.addEventListener("click", () => chooseFinding(algorithm));
    item.append(button);
    cardList.append(item);
  }

  improveShuffle.addEventListener("click", newImproveArray);
  improveRaceButton.addEventListener("click", improveRace);
  // A fresh 60 arrays. Pressing it repeatedly is how the random pivot's row on
  // random input shows itself as a coin flip while its two ordered rows barely
  // move -- no copy required, and no copy would be believed as readily.
  improveRerun.addEventListener("click", runImproveStats);
  // No listener on the improvement slider either: improveStepMs() reads it when
  // scheduling the next frame, so a mid-race drag lands on the next step.

  for (const id of PANEL_IDS) {
    const panel = panels[id];
    for (const [value, label] of Object.entries(ALGORITHM_LABELS)) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      panel.select.append(option);
    }
  }
  panels.a.select.value = "bubble";
  panels.b.select.value = "quick";

  for (const [value, label] of Object.entries(SHAPE_LABELS)) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    shapeSelect.append(option);
  }
  shapeSelect.value = "random";

  shuffleButton.addEventListener("click", newStart);
  raceButton.addEventListener("click", race);
  // No listener for the slider: currentStepMs() reads it when scheduling the
  // next frame, so a mid-race drag is picked up by the next step on its own.
  shapeSelect.addEventListener("change", changeShape);
  statsButton.addEventListener("click", runStats);
  describeStatsScope();
  newStart();
}
