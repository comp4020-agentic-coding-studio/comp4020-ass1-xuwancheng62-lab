# Assignment 1 — sorting race

## What was the breakthrough that moved the work forward?

The breakthrough was when I stopped treating the sorting race as a visual
demonstration and started measuring what was actually happening. A single race
looked convincing, but it represented only one array. I therefore added repeated
statistics across random, nearly sorted and nearly reversed inputs.

The results changed the direction of the project. Insertion sort performed
extremely well on nearly sorted data but poorly on nearly reversed data, merge
sort remained relatively stable, and our quick sort suddenly became much worse on
nearly ordered inputs. More importantly, the surprising results made me question
our implementations rather than treat them as properties of the algorithms.
Bubble sort's constant 120 comparisons came from our fixed loops with no early
exit, and quick sort's degradation came from taking the last element as its
pivot.

That was the point where the project became more than a race animation. The
evidence led from Race to Statistics, then to What we found, and finally to
Improvements, where each original implementation could race a modified version.
Instead of deciding the whole website first and asking the agent to build it, I
found that building, measuring and questioning the result gave me better ideas
about what to build next.

## What did this work change about who I want to be as a software developer?

This project changed how I think about working with coding agents. I do not want
to become a developer who describes a feature and accepts whatever the agent
produces. I want to remain responsible for the questions being asked, the
evidence behind the answers, and the direction of the product.

The clearest lesson was that pushback matters. An agent can produce convincing
explanations and detailed plans, and that does not make its proposed direction
the right one. When I asked for a colourful header, it offered to carry the
icon's colours further into the page as well as the title; I kept them to the
title, because blue, amber and green already mean something specific in the race
legend. Agreeing would have been easier, and would have left the page saying two
things with one colour. Collaboration like this needs negative feedback as much
as approval — without it, an agent's speed only amplifies a wrong direction.

Being responsible does not mean controlling every implementation detail. Given a
1.1 MB icon, the agent resized and cropped it without asking, and stopped before
putting its colours on the page. That judgement was right, but next time it would
be the agent's to make again, so I wrote the line into the harness instead:
preparing an asset is its work, changing the palette is mine.

That is the developer I want to be — one who gives the agent room on repeatable
work, pushes back quickly when direction or complexity drifts, and fixes a
repeating problem in the harness rather than in another prompt.
