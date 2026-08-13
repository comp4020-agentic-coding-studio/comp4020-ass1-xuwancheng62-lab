# Assignment 1 — sorting race

## What was the breakthrough that moved the work forward?

The work turned when I stopped trusting screenshots. Merge sort's animation
looked right in six of them, across both viewports, with every check green — and
it was drawing arrays the data is never in. A still of a mid-animation moment
looks correct even when the frames either side of it are nonsense.

What made that a breakthrough rather than a bug fix was where I put the
correction. The obvious move was to prompt again until the animation looked
right. Instead I wrote the rule into `CLAUDE.md` — if the thing you built is a
process, check it over time, not in stills — and turned it into a test that
asserts every frame is a permutation of the input. I committed that test
deliberately red, so the history shows the bug being demonstrated before it was
fixed. Everything after ran faster, because the agent was working against a
standard rather than against my patience.

## What did this work change about who I want to be as a software developer?

Three times this week every check was green and the page was still wrong: the
invalid frames; a table where an exact number, 120.0, implied something false
about bubble sort; and a statistics table that spilled outside its card while
the document reported no overflow at all. None of those were coding mistakes.
They were questions my checks weren't asking.

So the developer I want to be is less the one who gets it passing, and more the
one who asks what a passing check cannot see — and then goes and wires that
question up.
