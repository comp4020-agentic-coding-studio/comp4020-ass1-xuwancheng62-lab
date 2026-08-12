import {
  ALGORITHM_LABELS,
  SORT_ALGORITHMS,
  shuffledRange,
  type AlgorithmKey,
  type SortStep,
} from "./sorting";

const ARRAY_LENGTH = 16;
// 100ms, not the 30ms of V1: a highlighted comparison needs to stay on screen
// long enough to read as "those two, specifically".
const STEP_MS = 100;
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
  if (!shuffleButton || !raceButton) {
    throw new Error("race controls are missing required markup");
  }

  let sharedArray: number[] = [];
  let racing = false;

  function shuffle(): void {
    if (racing) return;
    sharedArray = shuffledRange(ARRAY_LENGTH);
    for (const panel of Object.values(panels)) {
      renderBars(panel.bars, sharedArray, ARRAY_LENGTH);
      panel.counter.textContent = "0";
      delete panel.section.dataset.sorted;
      delete panel.section.dataset.winner;
    }
  }

  // Pulls one comparison at a time from the algorithm's generator, redraws,
  // then schedules the next pull with setTimeout so both panels animate
  // side by side instead of one sort finishing before the other starts.
  function runPanel(panel: PanelRefs, algorithm: AlgorithmKey, onDone: () => void): void {
    const generator = SORT_ALGORITHMS[algorithm]([...sharedArray]);

    function step(): void {
      const result = generator.next();
      renderBars(panel.bars, result.value.array, ARRAY_LENGTH, result.value);
      panel.counter.textContent = String(result.value.comparisons);
      if (result.done) {
        panel.section.dataset.sorted = "true";
        onDone();
        return;
      }
      setTimeout(step, STEP_MS);
    }
    step();
  }

  function race(): void {
    if (racing || sharedArray.length === 0) return;
    racing = true;
    shuffleButton!.disabled = true;
    raceButton!.disabled = true;
    let finished = 0;
    let winnerDeclared = false;

    for (const panel of Object.values(panels)) {
      delete panel.section.dataset.sorted;
      delete panel.section.dataset.winner;
    }

    for (const id of PANEL_IDS) {
      const panel = panels[id];
      const algorithm = panel.select.value as AlgorithmKey;
      runPanel(panel, algorithm, () => {
        if (!winnerDeclared) {
          winnerDeclared = true;
          panel.section.dataset.winner = "true";
        }
        finished++;
        if (finished === PANEL_IDS.length) {
          racing = false;
          shuffleButton!.disabled = false;
          raceButton!.disabled = false;
        }
      });
    }
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

  shuffleButton.addEventListener("click", shuffle);
  raceButton.addEventListener("click", race);
  shuffle();
}
