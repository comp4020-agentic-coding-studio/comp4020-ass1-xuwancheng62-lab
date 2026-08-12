# COMP4020 prototype

This is your starter repo for a COMP4020 prototype: a static site written in
HTML/CSS/TypeScript that builds to plain HTML/CSS/JS and deploys to GitHub
Pages. The **deployed site is what gets marked** --- not this repo, and not "it
works on my machine". It's marked live in Chrome against the deployed URL at two
viewports --- 1920×1080 (desktop) and 390×844 (phone) --- and both count in
full, so make that artefact good at both and use the checks below to know
whether it is.

What you're building this week — the spec — is published on the course website,
and this repo's name tells you which deliverable it is. Run the course plugin's
**start** skill at the start of each week: it pulls the right spec from the
course API, carries your harness forward from last week, and helps you turn the
spec's checkable lines into tests of your own. Read the spec before you build,
and see `spec/README.md` for how the checks in this repo relate to it.

## How to work in here

- Keep the dev server running (`pnpm dev`) so you see changes as you make them.
- Before you push, run `pnpm check`. It runs most of what CI runs --- build,
  lint, and the spec --- so you catch those in seconds instead of waiting for
  the pipeline. The links check, the evidence check, the secrets scan, and the
  deploy itself only run in CI; run `pnpm dlx linkinator ./dist --silent`
  locally against a fresh `pnpm build` for the links check without waiting for
  CI.
- To see what the page actually looks like rather than what you assume it looks
  like, open it in a browser (the `agent-browser` CLI, documented on
  [the course site](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/topics/backpressure/#agent-browser-the-rendered-page-as-ground-truth),
  works well for this). The rendered page is the truth; your mental model of it
  isn't.
- When a check fails, read its output before changing anything. Each check below
  names what it measures, and the failure message is the instruction: it tells
  you the file, the line, or the contract. Treat a red check as authoritative
  --- the page is wrong until the check is green, not until you decide it should
  be.
- Commit when the checks pass. Never commit a red state. **One narrow
  exception:** a regression test written deliberately ahead of its fix may be
  committed failing, so the history shows the red-to-green instead of a fix
  arriving with a test that never demonstrated the bug. The commit message must
  say it is deliberately red and name what fails. The very next commit turns it
  green. This does not license committing a red state for any other reason ---
  a check that went red because something broke is still a stop-and-fix, not a
  commit.

## Directing this project

These rules are mine, carried forward and added to each week. Each one is here
because something actually went wrong, or nearly did --- not because it sounded
like good practice.

- **Scope is mine to set.** Don't add pages, sections or features I haven't asked
  for. If you think something is missing, say so and let me decide. On crit 1 you
  wrote two pages I never requested; the content was accurate, and I still
  deleted one of them because it repeated the other. When a change meets the
  trigger test in
  [Planning and human--agent decision making](#planning-and-humanagent-decision-making),
  the place to raise it is `PLAN.md` before you build --- not a note in the diff
  afterwards.
- **Explain mechanisms I can't audit.** I don't know web development. When you use
  a mechanism I'm unlikely to recognise --- CSS sibling selectors, `:checked`
  state, grid, container queries --- leave a short comment saying what it does and
  why you chose it. I can judge content and behaviour; I can't reliably review
  code I've never written, and a green check doesn't mean I understood the diff.
- **Be careful with facts about real things.** These sites make claims about real
  subjects: on crit 1 a real product and era, on crit 2 a real organisation and
  what its current site gets wrong. Hedge anything uncertain, never invent
  statistics, dates, prices or opening hours, and flag any claim I should check
  myself. I can verify what I have seen first-hand; I can't verify the rest.
- **Data you generated is a claim until you check it against the source.** Not
  the same as hedging an uncertain fact above --- this is about values you
  produce with complete confidence: URLs, file paths, identifiers, version
  numbers, the shape of an API. On crit 2 you wrote all twelve Wikimedia poster
  URLs from memory instead of fetching them. Every one looked right and every
  one 404'd, and the types, the build and the whole spec suite stayed green,
  because a broken external image isn't a broken build. Fetch it, `curl` it, or
  read it off the live source before it goes in a file --- and tell me which of
  those you did, so I know the difference between checked and merely plausible.
- **Both viewports before you call it done.** 1920×1080 and 390×844 both count in
  full at marking. Look at the rendered page with `agent-browser` and tell me what
  you saw --- don't infer it from the CSS.
- **If the thing you built is a process, check it over time --- not in stills.**
  Screenshots verify layout; they cannot verify an animation. Step through the
  frames and confirm the intermediate states are states the data could actually
  be in. On assignment 1 you took six screenshots across both viewports and
  called the sorting race done; over half of Merge Sort's frames were displaying
  a duplicate bar height --- an array the data is never in --- and every check
  stayed green, because nothing asserted that a frame is a permutation of the
  input. A still of a mid-animation moment looks correct even when the frames
  either side of it are nonsense. When the intermediate states are the
  explanation, they are the thing to test, not just the end state.
- **Anything that appears on every page has to sit in the same place on every
  page.** The nav especially. On crit 1 my four pages had titles and subtitles of
  different lengths; on a phone they wrapped to different numbers of lines, so the
  nav underneath started lower on some pages than others and the buttons jumped as
  I clicked between them. Nothing catches this on a single page --- you have to
  move through all of them at 390×844 and watch whether the shared furniture
  holds still.
- **Turn a brief's constraints into tests before building.** Crit 1 asked for no
  JavaScript, so the rule became a spec test that fails on any `<script>` in the
  built output. A constraint I'm only holding in my head is one I'll lose.
- **My own checks are mine to change --- out loud.** If a check I wrote blocks a
  change I've decided on, change the check deliberately and leave a comment
  saying why. Never relax one quietly to get green.

## Planning and human--agent decision making

On crit 2 I nearly handed you a one-line brief --- "make movies easier to find,
four cards a row" --- and let you build. Asking for a `PLAN.md` first instead
surfaced four decisions I hadn't made yet (which cinemas, how many titles,
whether trailers embed, where discovery stops and booking starts), and I
overrode your default on every one of them. That review is the reason the site
matches what I wanted. This section is here to make it repeatable.

**The trigger test.** Plan before you implement if the change would:

- add or remove a page, section, or navigation entry;
- change what the site claims about a real thing --- an organisation, product,
  person or place;
- change the visual system: palette, type scale, layout structure, or how many
  cards sit in a row;
- change what the reader can do on the site.

Anything else is implementation detail and yours to handle. **If you can't tell
which side a change falls on, it's a planning decision.** On crit 2 you made two
calls that sat right on this line without raising either: a visually-hidden
`<h1>` so the section heading could carry the visual weight, and a two-column
desktop grid on the cinemas page. Both were reasonable and I'd have approved
both --- that's not the point. I want to be asked.

Then:

1. Read the brief, the spec, the existing code and the project context before
   proposing anything.
2. Write `PLAN.md`. It should name the problem being solved, the proposed
   approach and structure, the assumptions and ambiguities, the design decisions
   and the constraints the spec imposes, and --- separately --- what can be
   machine-checked versus what needs my judgement.
3. Put ambiguities in the plan rather than resolving them quietly. An ambiguity
   you settled without telling me is indistinguishable, in the diff, from one
   you never noticed.
4. **Once I approve `PLAN.md`, it's frozen.** Don't edit it to match what you
   ended up building. If the work needs to depart from it, stop and explain the
   departure to me, and I'll decide whether to accept it or amend the plan
   deliberately. A plan I approved and you then rewrote is evidence of nothing;
   a stale plan plus a record of the departures is evidence of how the work
   actually went.
5. Implementation may then proceed autonomously as far as it doesn't alter the
   agreed product intent, scope, or design direction.

The document is not the point --- the review is. A `PLAN.md` I never argued with
has done nothing for either of us. And this rule outranks any default that
biases you toward pressing on without asking: on a trigger-test change, stopping
is the correct behaviour, not a failure to be helpful.

## The checks (your sensors)

CI runs these on every push once your repo is public. GitHub's checks UI shows
two jobs, `check` and `deploy` --- not one status per sensor below --- and
within `check` the steps run in sequence (`pnpm check` chains typecheck, build,
lint, and the spec with `&&`), so an early failure like a broken build stops the
later sensors from running for that push; fix it and push again to see the rest.
While the repo is private (all week, until you ship) the CI jobs stay skipped
--- `pnpm check` is the same roster on your machine, and it's the faster loop
anyway. They aren't hoops. Each is a different way of finding out something true
about the site that you can't reliably see by looking at it.

They also carry a mark at a crit: the sweep runs fifteen minutes after your
cutoff, and green checks there are worth half that week's shipped mark. Still
running counts as not green, so ship with time for CI to finish.

- **typecheck** --- `tsc --noEmit` runs first in `pnpm check`, so a type error
  stops the roster before the build even starts. The types are extra
  backpressure: a red here is the compiler telling you a claim in the code is
  false.
- **build** --- the site must build (`pnpm build`). A build failure means the
  deployed site is broken or stale, so nothing else matters until this is green.
- **deploy / online** --- the live GitHub Pages URL must load and return the
  page you expect. An asset that 404s on the deployed URL counts as broken even
  if it loads locally.
- **spec** --- `spec/invariants.test.ts` asserts what's true of any good
  website, whatever the week's brief asks; the tests you write for the week's
  own spec run alongside it (any `spec/*.test.ts`). A failure names the contract
  you haven't met yet.
- **lint** --- `stylelint` for CSS, `oxlint` for TypeScript. Flags code that's
  wrong, fragile, or non-idiomatic. Read the rule it names.
- **tests** --- any other tests you write, wherever you put them (co-located
  with your source is fine, not just `spec/`), must pass. Vitest picks up both
  this and the spec suite in one `vitest run`, the last step of `pnpm check`. A
  failing test is a claim about the site that's no longer true.
- **evidence** (`pnpm check:evidence`) --- checks your process evidence:
  `PROCESS.md`'s citations resolve to real commits, the current deliverable's
  exact reflection is in `reflections/` (worked out from this repo's name
  against the public course API), and your `CLAUDE.md` is present. Evidence
  gates the deploy --- `deploy` needs `check` to pass, so failing evidence
  blocks the deploy alongside everything else. See
  [Your process is part of the mark](#your-process-is-part-of-the-mark) below,
  and the course website's
  [assessment page](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/topics/assessment/#what-you-submit)
  for what counts as evidence.
- **links** --- internal links must resolve. A broken link is a dead end you
  didn't mean to ship.
- **secrets** --- the repo is scanned for committed credentials. Never put a
  key, token, or password in a tracked file. If one leaks, rotate it. A local
  pre-commit hook (`.githooks/pre-commit`, installed by `pnpm install`) also
  blocks any commit containing something shaped like an API key --- by the time
  CI sees a key it's already pushed, so the hook is the sensor that matters.

Nothing here measures **accessibility** or **performance** --- wiring those
sensors (`axe-core`, Lighthouse, or whatever you choose) is your work, and later
in the course the spec will ask you to show how you tested both. When you do,
read a green performance result honestly: it's a lab estimate from one run on a
CI machine, not proof the site is fast for real users.

## The stack is swappable

Out of the box this is plain HTML/CSS/TypeScript on Vite, and every `.html` file
in the repo is a page: add pages, link them, and the build picks them up with no
config. That's a default, not a rule (unless the week's spec says otherwise).
You can swap in Astro or any other static generator, because nothing in CI names
a tool --- the whole contract is:

- `pnpm build` emits the complete site into `dist/`
- the `package.json` scripts (`check`, `check:evidence`, `build`) keep working
- whatever lands in `dist/` still passes the invariants in `spec/`

Two things bite in a swap. The deployed site lives under a path
(`…github.io/<repo>/`), so configure your generator's base path --- this
template's Vite config uses relative asset URLs to sidestep that, but most
generators (Astro included) need `base` set explicitly, and getting it wrong
looks fine locally while every asset 404s on the live URL. And commit the
updated `pnpm-lock.yaml`: CI installs with `--frozen-lockfile`.

## Your process is part of the mark

The deployed page is only half of it. How you got there is marked too: your
commit history, your agent files, and the decisions visible across them. The
checks above can't see any of that, so a person reads it directly --- which
means building legibly is part of building well.

- **Commit as you go.** Small, frequent commits are the record of how the work
  came together, and that record is read, not just the final state. A trail that
  grew alongside the code is the strongest evidence of your process; a single
  dump the night before is the weakest.
- **Keep a process overview** (`PROCESS.md`). A short reading-guide, not an
  essay: what you built, the moments that mattered --- each pointing at a
  commit, a `CLAUDE.md` change, or a prompt and the commit it produced --- and
  where to look in the history. It points a marker at the evidence; it doesn't
  stand in for it, and claims the history doesn't back don't count. The
  `PROCESS.md` in this repo is a template showing the shape and the citation
  format (link text the commit hash or range, target the commit or compare URL);
  `pnpm check:evidence` verifies your citations resolve to real commits before
  you ship. Markers follow those citations and don't trawl the repo for evidence
  you didn't cite.
- **Write your reflection in `reflections/`** --- a short markdown file in this
  repo, named for the deliverable it answers, so the number in the filename is
  the number in this repo's name (`crit-1.md` in `comp4020-crit1-<you>`,
  `assignment-1.md` in `comp4020-ass1-<you>`); `reflections/README.md` has the
  full rule. `pnpm check:evidence` checks the exact current name against the
  course API, not merely the presence of any well-named file. It answers the two
  standing prompts: the breakthrough that moved the work forward, and what this
  work changed about the developer you want to be. It stays out of the deployed
  site. It's due at the cutoff, and if it isn't in the repo by then the week
  doesn't count as shipped, however good the prototype is.
- **This file is process evidence.** The harness you build to direct the agent,
  this `CLAUDE.md` and any `AGENTS.md`, is itself read as part of how you
  worked. Keep it honest and current (see below).

You don't need a name, a student number, or any identity file in the repo: we
know whose repo it is. Spend the effort on the work.

## This file is yours

This CLAUDE.md is a starting point, not a fixed rulebook. As you learn what your
prototype needs --- a convention to hold the agent to, a sensor that keeps
catching you out, a fact about the stack the agent keeps getting wrong --- write
it down here. Growing this file is the work of harness engineering, and the gap
between this boilerplate and your own version is part of what your prototype
says about the developer you're becoming.
