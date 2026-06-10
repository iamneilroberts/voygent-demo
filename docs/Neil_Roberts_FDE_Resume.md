# Neil Roberts

Mobile, AL — open to relocation and travel · (251) 463-5712 · dneilroberts@gmail.com · linkedin.com/in/dneilroberts

**Forward Deployed / Applied AI Engineer** — I ship production LLM agents (MCP servers, sub-agents, agent skills, and evaluation frameworks) on top of 25 years running mission-critical data systems in regulated enterprises.

---

## Summary

Engineer who now spends most build time shipping agentic systems on Claude: production MCP servers, sub-agent architectures, custom agent skills, and LLM evaluation harnesses. That work sits on 25 years of operating high-stakes production environments — healthcare revenue cycle, defense manufacturing — where systems have to actually hold up under load. Comfortable embedding with a customer, reverse-engineering an undocumented system, and getting something into production fast as the autonomous technical point person.

---

## Selected AI / Agentic Engineering Work

**dba-box — on-prem AI performance analyst for SQL Server** · *Python, MCP, local LLM*
- Built an AI analyst that diagnoses SQL Server performance pathologies and writes forensic postmortems, designed for regulated environments that can't send data to a cloud model (runs against a local LLM via Ollama).
- Multi-source adapter architecture: one pluggable interface normalizes Quest Spotlight (ADK), SolarWinds Orion, and direct DMV / Query Store data into a single canonical model — the recurring "read several vendor schemas, normalize to one" problem.
- ShowPlanXML execution-plan analyzer with 24 plan-quality rules; finding lifecycle with auto-reopen on regression; remediation tracking that survives third-party vendor upgrades.
- Exposed as an MCP server (25 tools) so agents can query it during incident triage. **1,141 tests across 110 files.** Run against real production incidents.

**voygent — production MCP product on Cloudflare Workers** · *TypeScript*
- 80+ tool MCP server powering a live travel-advisory business; advisors connect it to Claude or ChatGPT over a single MCP URL. In production, driving 100+ live client proposals.
- Semi-autonomous planning agent that defines explicit success criteria for a trip and works toward them, consulting the advisor only when it needs guidance — then hands the client a rich interactive proposal with live budget, optional add-ons, and per-section feedback. Shifts the drudgery of juggling alternatives to the agent and the choosing to the client, while keeping the human advisor reactive in real time.
- Built interactive, stateful agent UI before it was standard: inline flight / hotel / tour / cruise "boards" present the model's top options with controls (cheaper, nonstop, ± dates, more-like-this, drop) that round-trip the user's choice back to the LLM and push refreshed options to the board — the same direction MCP Apps later standardized.
- Integration against hostile sources: ~16 supplier portals reverse-engineered from undocumented endpoints, defeating Akamai / JA3 bot defenses via Chrome-fingerprinted proxied fetch; documented case studies such as the MSC cruise endpoint. Storage spans Cloudflare KV / D1 / R2 with versioned append-only histories and optimistic-locking patterns.

**LLM evaluation framework — persona + judge** · *TypeScript*
- Automated UX-quality eval harness: 13 named user personas exercise the product across 22 scenarios; a higher-grade judge model scores each run on weighted dimensions (task completion, UX, data quality, error handling); 3-sample baselines catch regressions and auto-file issues with generated fix prompts.
- A separate production A/B (in the mail agent below) pits two cheaper models against each other with a stronger model as judge and a weekly automated comparison. Eval-driven development in production, not notebooks.

**Production email-triage agent** · *Python*
- Read-only IMAP agent triaging a live business mailbox; **3,700+ messages classified** with a 13-category Pydantic-validated classifier and confidence thresholds; append-only classification history keyed by classifier version so models can be A/B'd retroactively and cost-sliced; deterministic daily digest; hardened systemd deployment. Runs daily.

**scaffold — MCP app framework** · *TypeScript, published to npm*
- `@voygent/scaffold-core`: framework for standing up niche MCP apps on Cloudflare Workers, with 6 working example apps. Optimistic locking, constant-time hashed auth keys, per-user usage caps, code-review and researcher sub-agents.


---

## Professional Experience

### Senior Database Administrator — Austal
**Oct 2025 – Present · Mobile, AL · Hybrid**
- Designed and shipped a multi-vendor monitoring app on the company intranet (Plotly Dash) that integrates SolarWinds Orion, Quest Spotlight, and ManageEngine — including live support-ticket data — into one system-level health view. None of the vendor databases were documented, so I used Claude Code to write probe scripts, reverse-engineered the schemas, built the integrations, and exposed the combined signal to AI agents over MCP for first-pass incident triage.
- Cut a recurring 6-minute query against an 80M-row heap to ~3 seconds by spotting a missing INCLUDE column, which also eliminated an upstream blocking issue; the change is being merged into the vendor's product.
- Built an Extended Events session for service-account attribution without SQL Audit overhead; ran an enterprise encryption-posture audit (TDE, backup encryption, cert/key inventory, TLS, Always Encrypted) with an executive-summary recommendation.

### Senior Database Administrator — Optum Technology / Accureg
**2022 – Oct 2025 · Remote · Healthcare**
- Owned availability, performance, and patching for a 300+ database estate across on-prem SQL Server, Azure SQL Managed Instance, Azure SQL Database, and Azure VM SQL Server.
- Led migration of 284 databases to Azure SQL MI / Azure SQL Database with near-zero downtime.
- Cut top revenue-cycle stored-procedure runtime by 70% and took customer-facing outages from daily to rare; sole 24×7 on-call and incident lead.
- Replaced the commercial monitoring product estate-wide with DBA-Dash (~$35K/yr saved); custom archival and partitioning freed 2 TB and avoided a $75K hardware purchase; built PowerShell automation and Azure Data Factory ETL flows with in-flight PHI masking.

### Database Consultant / Owner — Axiom LLC
**2001 – Present**
- Independent senior DBA and, increasingly, applied-AI consulting: performance tuning, HA/DR design, migrations, and production agentic tooling. Autonomous technical point person across diverse clients; designed DR strategies at ~15-minute RPO / 30-minute RTO.

### Senior Database Administrator — GTL
**2006 – 2020**
- Ran 100+ SQL Server instances in a 24×7 production environment; built multi-node clusters; led zero-downtime data-center migrations and version upgrades.

---

## Technical Skills

- **LLM / Agentic:** Multiple production MCP servers (travel platform, SQL Server analyst, app framework), sub-agents, custom agent skills, interactive / generative agent UIs, evaluation frameworks (persona/judge, LLM-as-judge A/B), prompt and context engineering, RAG (vector + FTS5), local LLMs (Ollama), Claude Code / agentic workflows
- **Languages:** Python, TypeScript / JavaScript / Node, T-SQL, PowerShell, Bash, SQL
- **Platforms:** Cloudflare Workers / D1 / KV / R2, Microsoft Azure (SQL MI, SQL DB, DMS, Data Factory, VMs), Docker, Linux / systemd
- **Data systems:** SQL Server (expert, 2005–2022), Azure SQL MI/DB, PostgreSQL, SQLite (incl. sqlite-vec), vector / full-text search
- **Practice:** production deployment under load, incident response and root-cause analysis, reverse-engineering undocumented systems, eval-driven development, customer-facing discovery and delivery

---

## Education

- **B.S., Information Systems** (Business minor) — University of South Alabama

---

## Selected Links

- Live MCP product: voygent-lite.somotravel.workers.dev · Client output: somotravel.us
- LinkedIn: linkedin.com/in/dneilroberts
- *GitHub: (add once a representative repo is public — see note)*
