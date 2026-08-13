import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { initRace } from "../src/race";

/* An accessibility sensor, because CLAUDE.md says wiring one is my job and
   nothing else in the roster measures it. It runs axe-core over the BUILT page
   -- the same dist/ the invariants read -- so it checks what actually ships.

   WHAT THIS CAN AND CANNOT SEE, out loud, because a green result here is not
   "the page is accessible":

   - It CAN see markup and semantics: a control with no accessible name, a
     duplicate id, an invalid ARIA attribute, landmarks, heading order, a
     select with no label. These are the failures that are invisible when you
     look at the page and obvious to a screen reader. I checked that by
     breaking the built page four ways and watching this go red: stripping a
     <label> gives `select-name`, emptying the Race button gives `button-name`,
     removing the icon's alt gives `image-alt`, and a bogus aria-* attribute
     gives `aria-valid-attr`. 34 rules evaluate here; 52 don't apply.
   - It does NOT fail on axe's `incomplete` results, and that bucket is not
     empty. A dangling `aria-labelledby` lands there rather than in
     `violations`, so this suite would have sailed straight past one -- which
     is why the IDREF test below exists as its own assertion. Two more,
     `landmark-one-main` and `page-has-heading-one`, are permanently incomplete
     without layout and are already covered by spec/invariants.test.ts.
   - It CANNOT see colour contrast. axe measures contrast by rendering, and
     jsdom has no layout engine and no canvas, so `color-contrast` is turned
     off below rather than left to report a misleading pass. Contrast on this
     site is checked by hand and the numbers live next to the colours they
     describe (styles.css h1 .title, and PLAN.md Amendment 11 for the slider).
   - It CANNOT see anything that only exists once the CSS is applied, for the
     same reason: the stylesheet is not loaded here.

   It scans twice, because most of this page does not exist until you click:
   once on the page as delivered, and once after opening the statistics panel
   and a findings card, which is where the second half of the controls live. */

const axeSource = readFileSync(
  createRequire(import.meta.url).resolve("axe-core/axe.min.js"),
  "utf8",
);

const html = readFileSync(resolve("dist/index.html"), "utf8");

/** A JSDOM with the built page in it, axe loaded, and the app booted. */
function bootedPage(): JSDOM {
  const dom = new JSDOM(html, {
    // axe is injected as a script, so the window has to be able to run one.
    runScripts: "dangerously",
    // Without this there is no requestAnimationFrame for the app to boot into.
    pretendToBeVisual: true,
    url: "https://example.org/",
  });
  dom.window.eval(axeSource);
  initRace(dom.window.document);
  return dom;
}

type AxeViolation = {
  id: string;
  impact: string | null;
  help: string;
  nodes: { html: string; failureSummary?: string }[];
};

async function violations(dom: JSDOM): Promise<AxeViolation[]> {
  const axe = (dom.window as unknown as { axe: { run: (ctx: unknown, opts: unknown) => Promise<{ violations: AxeViolation[] }> } }).axe;
  const result = await axe.run(dom.window.document, {
    resultTypes: ["violations"],
    rules: {
      // Cannot be evaluated without layout -- see the note at the top.
      "color-contrast": { enabled: false },
    },
  });
  return result.violations;
}

/** Everything axe found, in the failure message, so a red test is readable. */
function describeViolations(found: AxeViolation[]): string {
  return found
    .map(
      (v) =>
        `\n  [${v.impact ?? "unknown"}] ${v.id}: ${v.help}\n` +
        v.nodes.map((n) => `      ${n.html.slice(0, 120)}`).join("\n"),
    )
    .join("");
}

describe("accessibility (axe-core, semantics only)", () => {
  it("has no axe violations on the page as delivered", async () => {
    const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true });
    dom.window.eval(axeSource);
    const found = await violations(dom);
    expect(found, describeViolations(found)).toEqual([]);
  }, 30_000);

  it("has no axe violations once the statistics and a finding are open", async () => {
    const dom = bootedPage();
    const doc = dom.window.document;
    doc.querySelector<HTMLButtonElement>('[data-testid="stats-button"]')?.click();
    doc.querySelector<HTMLButtonElement>(".cards button")?.click();

    const found = await violations(dom);
    expect(found, describeViolations(found)).toEqual([]);
  }, 30_000);

  /* axe reports a dangling reference as `incomplete`, not a violation, so the
     scans above cannot catch one. These attributes all point at an element by
     id; a pointer to an id that isn't there is a control whose name or
     description silently vanishes. Checked in the opened state too, because
     that is where the script-written ARIA lives. */
  it("resolves every ARIA reference, including after opening a finding", async () => {
    const dom = bootedPage();
    const doc = dom.window.document;
    doc.querySelector<HTMLButtonElement>('[data-testid="stats-button"]')?.click();
    doc.querySelector<HTMLButtonElement>(".cards button")?.click();

    const dangling: string[] = [];
    for (const attr of ["aria-labelledby", "aria-describedby", "aria-controls", "aria-owns"]) {
      for (const el of doc.querySelectorAll(`[${attr}]`)) {
        for (const id of el.getAttribute(attr)!.split(/\s+/).filter(Boolean)) {
          if (!doc.getElementById(id)) dangling.push(`${attr}="${id}" on ${el.tagName}`);
        }
      }
    }
    expect(dangling, `these point at ids that do not exist:\n${dangling.join("\n")}`).toEqual([]);
  });

  it("gives every control an accessible name, including the ones added by script", async () => {
    const dom = bootedPage();
    const doc = dom.window.document;
    doc.querySelector<HTMLButtonElement>(".cards button")?.click();

    const nameless: string[] = [];
    for (const el of doc.querySelectorAll("button, select, input, a")) {
      const name =
        el.getAttribute("aria-label") ??
        (el.getAttribute("aria-labelledby")
          ? doc.getElementById(el.getAttribute("aria-labelledby")!)?.textContent
          : null) ??
        (el.id ? doc.querySelector(`label[for="${el.id}"]`)?.textContent : null) ??
        el.closest("label")?.textContent ??
        el.textContent;
      if (!name?.trim()) nameless.push(el.outerHTML.slice(0, 100));
    }
    expect(nameless, `controls with no accessible name:\n${nameless.join("\n")}`).toEqual([]);
  });
});
