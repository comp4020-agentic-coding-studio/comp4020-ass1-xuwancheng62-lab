import {
  ALGORITHM_LABELS,
  ALGORITHM_VARIANTS,
  INPUT_SHAPES,
  SHAPE_DESCRIPTIONS,
  SHAPE_LABELS,
  SORT_ALGORITHMS,
  comparisonStats,
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
  container.replaceChildren(
    ...values.map((value, index) => {
      const bar = document.createElement("div");
      bar.className = "bar";
      bar.dataset.value = String(value);
      bar.style.height = `${(value / max) * 100}%`;
      // data-role picks the highlight colour in styles.css. Pivot is checked
      // first so quick sort's pivot keeps its own colour even though it is also
      // one of the two values being compared.
      if (marks.pivot === index) {
        bar.dataset.role = "pivot";
      } else if (marks.compared?.includes(index)) {
        bar.dataset.role = "compared";
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
  // showed one condition at a time.
  function describeStatsScope(): void {
    const shapes = SHAPE_KEYS.map((shape) => `${STATS_RUNS} ${SHAPE_DESCRIPTIONS[shape]}`);
    const listed = `${shapes.slice(0, -1).join(", ")} and ${shapes.at(-1)}`;
    statsScope!.textContent = `Comparisons made on ${listed}, every array ${ARRAY_LENGTH} items long.`;
  }

  // The selector is the race's condition only. It deliberately leaves the
  // statistics alone: under Amendment 3 it cleared them, because the table then
  // showed the selected shape and stale numbers would have sat under a caption
  // naming a different one. The table now names all three itself, so there is
  // no mismatch to prevent -- see PLAN.md Amendment 4.
  function changeShape(): void {
    if (racing) return;
    newStart();
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
    // of the race. Only the speed slider stays live.
    shapeSelect!.disabled = true;
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
        shapeSelect!.disabled = false;
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
