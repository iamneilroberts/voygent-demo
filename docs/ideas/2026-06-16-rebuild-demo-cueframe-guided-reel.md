---
title: Rebuild demo so cueframe can update a reel from guidance
slug: rebuild-demo-cueframe-guided-reel
type: feature
priority: next
milestone: none
issue: https://github.com/iamneilroberts/voygent-demo/issues/10
status: open
created: 2026-06-16
---

## Problem / motivation
Rebuild the demo. As part of that, give cueframe the ability to update an
existing reel from some guidance — i.e. point cueframe at a reel plus a bit of
direction and have it revise the reel, rather than only building one from
scratch.

## Rough approach
TBD. Related prior work in this repo:
- `docs/superpowers/specs/2026-06-13-cueframe-live-reel-anchors.md`
- `docs/superpowers/specs/2026-06-14-cueframe-iframe-spike.md`

## Open questions
- What form does "guidance" take — natural-language prompt, structured edits, or both?
- Does cueframe update the reel in place, or produce a new version?
- How much of the demo rebuild depends on this capability vs. is independent?

## Notes
Captured via /idea from voygent-lite (cross-repo). Lives in voygent-demo because
the demo rebuild is the home initiative; the cueframe change is the mechanism.
