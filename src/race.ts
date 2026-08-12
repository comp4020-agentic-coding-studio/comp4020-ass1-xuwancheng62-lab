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
  const statsBody = root.querySelector<HTMLElement>('[data-testid="stats-body"]');
  const statsScope = root.querySelector<HTMLElement>('[data-testid="stats-scope"]');
  if (!shuffleButton || !raceButton || !speedSlider || !shapeSelect || !statsButton || !statsBody || !statsScope) {
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

  function describeStatsScope(): void {
    statsScope!.textContent =
      `Comparisons made on ${STATS_RUNS} different ${SHAPE_DESCRIPTIONS[currentShape()]} of ` +
      `${ARRAY_LENGTH} items.`;
  }

  // Changing the condition invalidates any statistics on screen: numbers from
  // one shape sitting under a caption naming another is the exact kind of
  // false claim this control exists to expose.
  function changeShape(): void {
    if (racing) return;
    statsBody!.replaceChildren();
    describeStatsScope();
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

  function runStats(): void {
    const inputs = shapeSample(currentShape(), ARRAY_LENGTH, STATS_RUNS);
    // comparisonStats takes the inputs and loops the algorithms inside, so all
    // four are scored on this same set of arrays rather than on their own draws.
    const rows = comparisonStats(inputs);
    describeStatsScope();
    const fewest = Math.min(...rows.map((row) => row.averageComparisons));

    statsBody!.replaceChildren(
      ...rows.map((row) => {
        const tr = document.createElement("tr");
        tr.dataset.algorithm = row.algorithm;
        if (row.averageComparisons === fewest) tr.dataset.fewest = "true";

        const name = document.createElement("th");
        name.scope = "row";
        name.textContent = ALGORITHM_LABELS[row.algorithm];
        // Where the number depends on which variant we implemented, the variant
        // is named right here in the row rather than in a footnote, so nobody
        // reads Bubble's flat 120 as a fact about bubble sort in general.
        const variant = ALGORITHM_VARIANTS[row.algorithm];
        if (variant) {
          const note = document.createElement("small");
          note.textContent = variant;
          name.append(note);
        }

        const average = document.createElement("td");
        average.dataset.testid = `stats-average-${row.algorithm}`;
        average.textContent = row.averageComparisons.toFixed(1);

        const wins = document.createElement("td");
        wins.textContent = String(row.fewestWins);

        tr.append(name, average, wins);
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
