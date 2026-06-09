// Resume page body (task 8). Source of truth: voygent-demo docs/Neil_Roberts_FDE_Resume.md
// (kept in sync by hand — this is the rendered HTML form for the worker-served
// /info/resume page). FDE-targeted; the demo itself is the headline portfolio piece.
export const RESUME_BODY = `
<p><strong>Mobile, AL</strong> — open to relocation and travel · (251) 463-5712 · <a href="mailto:dneilroberts@gmail.com">dneilroberts@gmail.com</a> · <a href="https://linkedin.com/in/dneilroberts" target="_blank" rel="noreferrer">linkedin.com/in/dneilroberts</a></p>
<p>I ship production LLM agents (MCP servers, sub-agents, agent skills, and evaluation frameworks) on top of 25 years running mission-critical data systems in regulated enterprises. <strong>You're looking at one right now</strong> — <a href="/">this demo</a> is a hand-rolled MCP agent host driving the real Voygent product.</p>

<h2>Summary</h2>
<p>Engineer who now spends most build time shipping agentic systems on Claude: production MCP servers, sub-agent architectures, custom agent skills, and LLM evaluation harnesses. That work sits on 25 years of operating high-stakes production environments — healthcare revenue cycle, defense manufacturing — where systems have to actually hold up under load. Comfortable embedding with a customer, reverse-engineering an undocumented system, and getting something into production fast as the autonomous technical point person.</p>

<h2>Selected AI / Agentic Engineering Work</h2>

<h3>voygent — production MCP product on Cloudflare Workers · <span class="mono">TypeScript</span></h3>
<ul>
  <li>80+ tool MCP server powering a live travel-advisory business; advisors connect it to Claude or ChatGPT over a single MCP URL. In production, driving 100+ live client proposals.</li>
  <li>Semi-autonomous planning agent that defines explicit success criteria for a trip and works toward them, consulting the advisor only when it needs guidance — then hands the client a rich interactive proposal with live budget, optional add-ons, and per-section feedback.</li>
  <li>Built interactive, stateful agent UI before it was standard: inline flight / hotel / tour / cruise "boards" present the model's top options with controls (cheaper, nonstop, ± dates, more-like-this, drop) that round-trip the user's choice back to the LLM — the same direction MCP Apps later standardized.</li>
  <li>Integration against hostile sources: ~16 supplier portals reverse-engineered from undocumented endpoints, defeating Akamai / JA3 bot defenses via Chrome-fingerprinted fetch from a serverless edge. (The full story: <a href="/info/bot-defeat">the bot-defeat saga</a>.) Storage spans Cloudflare KV / D1 / R2 with versioned append-only histories and optimistic locking.</li>
</ul>

<h3>dba-box — on-prem AI performance analyst for SQL Server · <span class="mono">Python, MCP, local LLM</span></h3>
<ul>
  <li>AI analyst that diagnoses SQL Server performance pathologies and writes forensic postmortems, designed for regulated environments that can't send data to a cloud model (runs against a local LLM via Ollama).</li>
  <li>Multi-source adapter architecture: one pluggable interface normalizes Quest Spotlight, SolarWinds Orion, and direct DMV / Query Store data into a single canonical model.</li>
  <li>ShowPlanXML execution-plan analyzer with 24 plan-quality rules; finding lifecycle with auto-reopen on regression. Exposed as a 25-tool MCP server. <span class="stat">1,141 tests across 110 files.</span> Run against real production incidents.</li>
</ul>

<h3>LLM evaluation framework — persona + judge · <span class="mono">TypeScript</span></h3>
<ul>
  <li>Automated UX-quality eval harness: 13 named personas exercise the product across 22 scenarios; a higher-grade judge model scores each run on weighted dimensions; 3-sample baselines catch regressions and auto-file issues with generated fix prompts.</li>
  <li>A separate production A/B pits two cheaper models against each other with a stronger model as judge and a weekly automated comparison. Eval-driven development in production, not notebooks.</li>
</ul>

<h3>Production email-triage agent · <span class="mono">Python</span></h3>
<ul>
  <li>Read-only IMAP agent triaging a live business mailbox; <span class="stat">3,700+ messages classified</span> with a 13-category Pydantic-validated classifier and confidence thresholds; append-only history keyed by classifier version for retroactive A/B; deterministic daily digest; hardened systemd deployment.</li>
</ul>

<h3>scaffold — MCP app framework · <span class="mono">TypeScript, published to npm</span></h3>
<ul>
  <li><code>@voygent/scaffold-core</code>: framework for standing up niche MCP apps on Cloudflare Workers, with 6 working example apps. Optimistic locking, constant-time hashed auth keys, per-user usage caps, code-review and researcher sub-agents.</li>
</ul>

<h2>Professional Experience</h2>

<h3>Senior Database Administrator — Austal · Oct 2025 – Present · Mobile, AL</h3>
<ul>
  <li>Designed and shipped a multi-vendor monitoring app (Plotly Dash) integrating SolarWinds Orion, Quest Spotlight, and ManageEngine into one system-level health view. None of the vendor databases were documented — used Claude Code to write probe scripts, reverse-engineered the schemas, and exposed the combined signal to AI agents over MCP for first-pass incident triage.</li>
  <li>Cut a recurring 6-minute query against an 80M-row heap to ~3 seconds by spotting a missing INCLUDE column; the change is being merged into the vendor's product.</li>
</ul>

<h3>Senior Database Administrator — Optum Technology / Accureg · 2022 – Oct 2025 · Remote · Healthcare</h3>
<ul>
  <li>Owned availability, performance, and patching for a 300+ database estate across on-prem SQL Server and Azure SQL MI / DB / VM.</li>
  <li>Led migration of 284 databases to Azure with near-zero downtime. Cut top revenue-cycle stored-procedure runtime by 70%; sole 24×7 on-call and incident lead.</li>
  <li>Replaced the commercial monitoring estate with DBA-Dash (~$35K/yr saved); custom archival freed 2 TB and avoided a $75K hardware purchase.</li>
</ul>

<h3>Database Consultant / Owner — Axiom LLC · 2001 – Present</h3>
<ul>
  <li>Independent senior DBA and, increasingly, applied-AI consulting: performance tuning, HA/DR design, migrations, and production agentic tooling. Autonomous technical point person across diverse clients.</li>
</ul>

<h3>Senior Database Administrator — GTL · 2006 – 2020</h3>
<ul>
  <li>Ran 100+ SQL Server instances in a 24×7 production environment; built multi-node clusters; led zero-downtime data-center migrations and version upgrades.</li>
</ul>

<h2>Technical Skills</h2>
<ul>
  <li><strong>LLM / Agentic:</strong> Multiple production MCP servers, sub-agents, custom agent skills, interactive / generative agent UIs, evaluation frameworks (persona/judge, LLM-as-judge A/B), prompt and context engineering, RAG (vector + FTS5), local LLMs (Ollama), Claude Code / agentic workflows.</li>
  <li><strong>Languages:</strong> Python, TypeScript / JavaScript / Node, T-SQL, PowerShell, Bash, SQL.</li>
  <li><strong>Platforms:</strong> Cloudflare Workers / D1 / KV / R2, Microsoft Azure (SQL MI, SQL DB, DMS, Data Factory, VMs), Docker, Linux / systemd.</li>
  <li><strong>Practice:</strong> production deployment under load, incident response and root-cause analysis, reverse-engineering undocumented systems, eval-driven development, customer-facing discovery and delivery.</li>
</ul>

<h2>Education</h2>
<p><strong>B.S., Information Systems</strong> (Business minor) — University of South Alabama</p>

<p><a class="cta" href="/">← see the work running live</a></p>`;
