  You are working in /home/neil/dev/voygent-lite.

  Context:
  This repo powers a Voygent demo site at
  https://voygent-demo.somotravel.workers.dev/. The demo is aimed at technical
  hiring reviewers, especially people evaluating skill with AI app architecture,
  MCP/tool orchestration, coding-agent workflows, persistence, validation, model
  routing, cost control, and production-minded UI.

  The current demo has a Claude-like chat replay that builds a Dublin trip, plus
  an Engineering panel showing live telemetry: tool calls, token/cost usage,
  cache reads, context savings, deterministic render savings, routing, etc.

  Goal:
  Improve the demo so it reads less like “travel chatbot” and more like
  “credible MCP-based AI application with real engineering depth.” Keep the UI
  tasteful, restrained, and polished. Do not make it gimmicky or marketing-
  heavy.

  Please inspect the current implementation before editing. Prefer existing
  patterns and components.

  Required changes:

  1. Fix itinerary consistency in the Dublin replay/folio.
     Current issue: the flight departs MOB on 2026-10-12 and arrives Dublin the
     morning of 2026-10-13, but the folio shows “Arrive Dublin” on 2026-10-12
     and schedules activities that day.
     Update the simulation data and/or folio projection so:
     - Oct 12 is outbound travel, not a Dublin activity day.
     - Oct 13 is arrival in Dublin.
     - No full-day activity is placed before local arrival.
     - The final visible folio is internally consistent.

  2. Add visible validation/repair signals.
     In the Engineering panel, add a compact “Validation” or “Trip Integrity”
     section that can show checks like:
     - arrival date resolved
     - no activity before arrival
     - hotel nights match stay window
     - selected options persisted
     - folio projection rebuilt
     For the replay, include at least one validation event. If useful, show a
     “repaired” state for the arrival-date/activity placement issue, but keep it
     honest and not theatrical.

  3. Improve the Engineering panel’s top-level readability.
     Add a concise summary strip near the top that lets a technical reviewer
     understand the system in 10 seconds:
     - MCP tools exposed
     - tools used this run
     - persisted writes
     - tokens avoided / context kept out
     - actual cost
     - model routing active
     - validation checks
     Raw event details should remain available below.

  4. Clarify cost language.
     Separate exact observed/provider-style cost from estimates/counterfactuals.
     Avoid wording that overclaims precision. Suggested labels:
     - “Observed routed cost”
     - “Counterfactual estimate”
     - “Deterministic render estimate”
     - “Context kept out of model”
     Keep the detailed numbers, but make methodology clearer.

  5. Strengthen first-screen positioning.
     Add a small, tasteful signal that this is not just a chatbot. Example copy:
     “Live MCP tool orchestration, persisted trip state, model routing, and
     cost/context telemetry.”
     Keep it subtle. Do not create a landing page. The chat/demo should remain
     the primary first screen.

  6. Make the Claude-like skin feel more owned by Voygent.
     Keep the familiar chat interaction, but reduce the impression of a direct
     clone:
     - Preserve the disclaimer.
     - Make the Voygent brand more prominent than “simulated claude.ai.”
     - Adjust copy/header styling if needed so it feels like a Voygent demo
     running in a host-chat-inspired surface.

  7. Tighten visible copy.
     Fix spelling/wording issues such as:
     - “estiamated” -> “estimated”
     - “hallucenations” -> “hallucinations”
     - any awkward or overly cute copy
     Replace “This interface was itself built by a coding agent” with something
     more precise, e.g.:
     “Built with coding-agent workflows; architecture, constraints, and review
     by Neil Roberts.”

  8. Keep the design restrained.
     Do not add decorative gradients, blobs, or generic AI UI flourishes.
     Prefer dense but readable engineering UI: compact tables, chips,
     accordions, clear labels, restrained color.
     Preserve mobile usability.

  Verification:
  - Run the relevant tests/build commands.
  - If this is a frontend app, run the local dev server and inspect the flow in
  a browser if available.
  - Verify the replay completes and the folio dates are correct.
  - Verify the Engineering panel communicates the architecture clearly without
  overwhelming the first view.
  - Report changed files, tests run, and any remaining risks.

  Important:
  Do not rewrite unrelated architecture.
  Do not remove useful raw telemetry.
  Do not fake claims beyond what the demo actually does. If a metric is
  estimated, label it as estimated.

