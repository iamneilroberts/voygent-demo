# Test Plan — Backplanes Spotlight redaction + report-quality audit

_Created: 2026-06-18 — voygent-demo_

## Goal

Decide whether Backplanes Spotlight (https://www.backplanes.com) is safe and useful
on Voygent work, by running it against a **real but disposable** feature task in
`voygent-demo` and answering two independent questions:

1. **Security / redaction** — when a session touches credentials, prod URLs, and PII,
   does Backplanes' "local redaction strips PII and credentials before anything leaves
   your laptop" claim actually hold? What *does* leave the machine, and what's the blast
   radius if redaction misses something?
2. **Report quality** — is the generated session report accurate and useful, or
   confabulated/shallow? Measured against ground truth (git diff + what really happened).

These are separate axes. A report can be useful and still leak; it can redact perfectly
and still be worthless. Score them independently.

## What Backplanes is (confirmed from its site, 2026-06-18)

Local CLI (macOS/Linux/WSL2) that reads Claude Code + Codex session transcripts, redacts
PII/creds locally, uploads the result, and renders server-side "session reports" (what the
agent did, external services touched, security concerns, spend/ROI). Free for individuals,
no card, "No OAuth into Anthropic or OpenAI." The product is fundamentally **data-egress**:
the reports live server-side, so transcript-derived content leaves the laptop. That is the
exact thing we're auditing.

## Why voygent-demo is the right sandbox

- Self-contained Worker + web app with its own GitHub remote — blast radius is contained.
- It carries **real secrets** today: `.dev.vars` has a live `ANTHROPIC_API_KEY` +
  `VOYGENT_MCP_BEARER`; `.env` has `DEMO_ACCESS_CODE`/`DEMO_ACCESS_URL`. So redaction
  failure is not hypothetical — but we neutralize those to canaries first (Phase 0) so the
  test itself can never burn a live credential.
- Not wired to `voygent-prod` D1 or the shared KV, so no production data integrity surface
  is in play.

---

## Phase 0 — Neutralize real secrets, snapshot baseline (DO FIRST, non-negotiable)

The whole point is to provoke a leak and watch for it. We must guarantee that even a
total redaction failure leaks only **canaries**, never live creds.

1. **Back up the real secret files** outside the repo:
   `cp .dev.vars ~/backplanes-test-backup/.dev.vars.real`
   `cp .env ~/backplanes-test-backup/.env.real`
   (chmod 600 the backup dir.)
2. **Swap every real secret value for a uniquely-greppable canary** of the same *format*
   (so format-based redaction has a fair shot). See the canary table below. Keep key
   *names* identical — redaction often keys off the variable name, and we want to test that.
3. Confirm the demo still builds/typechecks with canaries in place (it won't call out, but
   we don't want broken-file noise polluting the report): `npm run typecheck` (or
   `npx tsc --noEmit`).
4. **Snapshot ground truth** for later report-quality comparison:
   - `git -C ~/dev/voygent-demo rev-parse HEAD` → record starting SHA.
   - Note start time.
5. Record the Backplanes account/install details (version, what it says it uploads, any
   local cache/staging path it writes to — find it: `find ~ -newer /tmp -iname '*backplane*'`
   after install, and check `~/.config`, `~/.local/share`, `~/.cache`).

### Canary table — plant one of each, all carrying the marker `CANARY7F3A`

Each value embeds the sentinel `CANARY7F3A` so we can grep the egress and the rendered
report for survivors. Use **format-valid-looking but fake** values:

| Class | Channel it should appear in | Example canary value |
|---|---|---|
| Anthropic API key | `.dev.vars` read + maybe echoed in bash | `sk-ant-api03-CANARY7F3A0000000000000000000000000000000000000000000000000000000000000000000000000000AA` |
| Bearer token | `.dev.vars` / curl `-H "Authorization: Bearer …"` | `vygt_CANARY7F3A_bearer_3kf9d8s7` |
| AWS-style access key | a throwaway config line | `AKIACANARY7F3AEXAMPLE` |
| Generic password | env / connection string | `Pw!CANARY7F3A_h0tel` |
| Private key block | a planted `id_test` file we cat | `-----BEGIN PRIVATE KEY-----\nCANARY7F3A…\n-----END PRIVATE KEY-----` |
| Tokened URL | `.env` `DEMO_ACCESS_URL` | `https://demo.voygent.ai/#code=CANARY7F3A-demo-code` |
| Email (PII) | a fake client record we touch | `kim.CANARY7F3A@example.com` |
| Phone (PII) | same record | `+1-555-0CANARY` (or `555-019-CANARY7F3A` if format-strict) |
| US SSN (PII) | same record | `078-05-CANARY` → use `078-05-1120` and note it separately if hyphen-strict |
| Credit card (PII) | same record | test PAN `4111-1111-1111-1111` (note: real-format test number) |

> Note on PII formats: some (SSN, card) can't embed the alpha sentinel without breaking the
> format detector. For those, use a **real-format test value** and track it by exact string
> match instead of the sentinel. Keep a `canaries.json` mapping `class → exact string` so the
> audit grep is mechanical.

Write the canary manifest to `~/backplanes-test-backup/canaries.json` (NOT in the repo).

---

## PHASE 3 — RESULTS (2026-06-18)

**Capture method that worked:** keylog+pcap FAILED (the gRPC/tonic upload path doesn't wire
`SSLKEYLOGFILE`; 0 keys logged). Pivoted to **`strace` on a re-upload**, reconstructing the
plaintext writes to the pre-upload staging file `~/.local/share/backplanes/daemon/.upload-tmp/
upload-<pid>-0-<sha>.jsonl`. That file is the **redacted transcript exactly as streamed to
`api.backplanes.com`** — 204,465 bytes, 109 records. Saved: `~/backplanes-test-backup/
redacted-egress.jsonl` (+ `/tmp/bp-strace.log`).

### Redaction recall — what actually left the laptop

| Canary class | In transcript | Verdict | Notes |
|---|---|---|---|
| **pii_email** `kim.…@example.com` | ✅ | **REDACTED** | replaced with `[REDACTED:pii-email]` (×4) |
| **pii_phone** `+1-555-867-5309` | ✅ | **LEAKED** | cleartext, in the real `client-record.json` read |
| **pii_ssn** `078-05-1120` | ✅ | **LEAKED** | cleartext |
| **pii_credit_card** `4111-1111-1111-1111` | ✅ | **LEAKED** | cleartext; canonical Luhn-valid test PAN |
| anthropic_api_key `sk-ant-api03-…` | ✅ | LEAKED | but canary not gitleaks-canonical length → not a clean secret-rule test |
| mcp_bearer `vygt_…` | ✅ | LEAKED | custom prefix; no rule |
| demo_access_code / tokened_url | ✅ | LEAKED | app secret in URL fragment |
| generic_password `Pw!…` | ✅ | LEAKED | no rule |
| aws_access_key_id / aws_secret / github_pat | partial | inconclusive | canary formats didn't match strict gitleaks regexes (e.g. `AKIA`+17 chars) — re-test with canonical formats for a fair secret-scrubber verdict |

**The single decisive, confounder-free result:** in the same JSON object from
`_canary/client-record.json`, the **email was redacted but phone, SSN, and credit card were
uploaded in cleartext.** The *only* redaction token anywhere in the 204KB payload is
`[REDACTED:pii-email]`.

**Headline finding:** Backplanes' local scrub catches **email only** among PII. **Phone, SSN,
and credit-card numbers leave the laptop in cleartext** — directly contradicting "Local
redaction strips PII and credentials before anything leaves your laptop." Their own installer
admits a server-side "second, more robust heuristic PII scrub," i.e. PII *is* sent and cleaned
only after receipt.

**Confounders / honesty caveats:**
1. The demo session opened this very plan doc (in `voygent-demo/docs/summaries/`), whose canary
   table contains the SSN/card/AWS strings → some hits are plan-doc echoes, not the intended
   channels. Inflates counts but every hit is still un-redacted text in the upload; the
   `client-record.json` phone/SSN/card leaks are independent of this.
2. The AWS/GitHub/Anthropic canaries weren't in gitleaks-canonical format, so their leak is NOT
   a fair test of the secret scrubber. A clean secrets round (canonical `AKIA`+16, `ghp_`+36,
   `sk-ant`+93`AA`) is needed to judge credential redaction. **Open / offered.**
3. The entire test methodology (this plan doc, canary values) is now on Backplanes' servers
   because the demo session read it. Noted for cleanup.

### Phase 3B — Report-quality analysis (dashboard report received)

**Mechanical accuracy: good.** Correctly captured the file changes (created
`scripts/mcp-healthcheck.sh` + `worker/access/client-card.ts`, edited `worker/index.ts` twice,
typecheck passed), model (`claude-opus-4-8`), cost ($2.72), duration (2m), token count (1.6M),
tool tallies. The IC/EM split and time-category breakdown are a genuinely nice format.

**Confabulation: real and notable.**
- **Invents a pull request.** "1 PR touched", "Worker utilities… Opened", a "Pull requests & CI"
  section with a CI binding — for a session that did **zero git operations**. Its *own* footnotes
  say `Git pushes: 0`, `GitHub API calls: 0`, `PR interactions: 0`. Internally contradictory: it
  fabricated a PR and then admitted it never saw one.
- "Diff staged for review" — nothing was `git add`-ed.

**Security reporting: actively misleading — and this is the important part.** The report's
single security finding is "4 PII **email** addresses … redacted … Verify and rotate if live,"
and it declares **"no credential leaks detected,"** **"no live credentials appear to have
leaked,"** with green ✓ "Auth & access clean" / "External services clean." Meanwhile the payload
it uploaded contained, in cleartext: the **phone, SSN, and credit-card** from the same
`client-record.json` it read, plus an **Anthropic API key, an MCP bearer token, a password, and a
demo access code** from the `.dev.vars`/`.env` it read. So the report gives a **green "all clear"
on exactly the axis the product is sold on, while the un-redacted material was already on its
servers.** False assurance is worse than silence: a user reading this concludes their secrets are
safe.

**Root cause:** the report's "security" view only knows what the redactor knows — and the
redactor only knows `pii-email`. Everything it can't pattern-match it reports as "clean" rather
than "not checked."

### VERDICT

**Do not adopt on any credential- or PII-bearing repo (which is all of Voygent).** Two
independent disqualifiers:
1. **Transit redaction is email-only.** SSN, credit card, phone, API key, and bearer left the
   laptop in cleartext — contradicting the headline claim. (Caveat: the API-key/AWS/PAT canaries
   weren't gitleaks-canonical, so the *credential* scrubber wasn't fairly tested; but the
   format-valid PII result is airtight and sufficient on its own.)
2. **The report's security section manufactures false confidence** ("no credentials leaked" +
   green checks) over real leaks, and confabulates a PR. You cannot trust its assurances.

**If revisited later:** it could be tolerable *only* on repos with zero secrets/PII, with `wizard`
never run, daemon scoped to an isolated config dir, telemetry off. Not worth the operational care
for what it delivers. A clean secrets round would sharpen finding #1 but wouldn't change the
verdict.

### Other findings (from binary recon, corroborated)
- **Default scope is dangerous:** `backplanes wizard` = "sign in **+ upload history**" backfills
  Claude Code transcripts across **all** projects under `~/.claude`. We avoided it via `login` +
  a scoped `config.toml` (`include_default_claude_config_dir=false`, isolated `CLAUDE_CONFIG_DIR`).
- Installer + binary are otherwise well-behaved: checksum-verified release, no sudo, opt-in
  PostHog telemetry (we disabled it), reasonable TLS hygiene (keylog not wired on the upload path).

### Still open
- **Report-quality axis (Phase 3B):** needs the rendered dashboard report from `app.backplanes.com`
  (Neil — browser). Compare its claims to `git diff` ground truth of the demo feature.
- **Clean secrets round:** optional, to fairly test credential redaction.
- **Server-side deletion:** the session (with leaked PII + plan doc) was uploaded — decide whether
  to delete it from the dashboard and whether deletion is verifiable.

---

## Phase 1 — SETUP RESULTS (2026-06-18) + execution runbook

**Installed:** `backplanes` CLI v2.3.0 (build f012ec6) → `~/.backplanes/bin/backplanes`.
Installer (`install.sh`, sha256 `de9696a9…`) inspected first: clean — checksum-verified
GitHub-release binary, no sudo, no remote `eval`, opt-in PostHog telemetry that claims to send
no transcripts/paths/keys.

**Binary recon (matters for the security writeup):**
- Rust: `rustls 0.21` + `reqwest 0.11` + **`tonic` gRPC**. Session upload = gRPC
  `backplanes.v1.CollectorService` (RegisterAgent / ExchangeSetupToken / GetIngestionStatus)
  over HTTP/2 TLS to **`api.backplanes.com`**. Web/setup `app.backplanes.com`. Telemetry
  `us.i.posthog.com`. Update checks `api.github.com`.
- **Bundles gitleaks** (`github.com/gitleaks/gitleaks` ref) → local redaction is
  regex/gitleaks-based. Prediction: catches `AKIA…`/`ghp_…`/`sk-ant-…`/private-key blocks;
  weak on free-form PII (phone/SSN/credit-card/email). The format-strict PII canaries are the
  real test.
- **`SSLKEYLOGFILE` is honored** (verified: an `update --check` TLS call wrote keylog lines).
  → capture without MITM CA or proxy.
- **Scope risk (real finding):** the daemon config (`claude_config_dirs`,
  `include_default_claude_config_dir`, `backfill_after_unix`, `send_scope`, `enabled_harnesses`,
  `poll_interval_minutes`) defaults to watching `~/.claude` and **`wizard` = "sign in + upload
  history"** → unscoped, it would backfill session transcripts across **all** projects, not just
  the demo. MUST scope before/at sign-in. Use `login` (auth only), NOT `wizard`.

**Capture method (locked):** `SSLKEYLOGFILE` + `sudo tcpdump` + `tshark` decrypt. Harness:
`~/backplanes-test-backup/capture.sh start|stop`. Decouples capture from the work session — do
the feature work first, then trigger the single upload under capture.

**Prerequisite still needed:** `tshark` not installed → `sudo apt install tshark` (for offline
keylog decode).

**Scoping decision (RECOMMENDED): isolated `CLAUDE_CONFIG_DIR`.** Run the Phase 2 demo session
under a throwaway config dir so its transcript is the *only* thing Backplanes can see, then point
the daemon there with `include_default_claude_config_dir=false`. Guarantees no other (voygent-lite
or parallel) session can be uploaded. One-time Claude Code re-login in that dir is the only cost.

### Runbook (who does what)
1. **Neil (one-time):** `sudo apt install tshark`.
2. **Neil (interactive, browser):** sign in WITHOUT backfilling history:
   `~/.backplanes/bin/backplanes login`  ← do NOT run `wizard`.
3. **Claude:** after login, read the written config; set `claude_config_dirs` to the isolated
   dir, `include_default_claude_config_dir=false`, `backfill_after_unix=<now>`, daemon autostart
   off. Confirm scope.
4. **Neil:** do the demo feature work in the isolated session:
   `CLAUDE_CONFIG_DIR=~/.claude-bp-test claude`  (in `~/dev/voygent-demo`) — naturally read
   `.dev.vars`, run a curl with the bearer, touch `_canary/client-record.json`, produce a diff.
5. **Claude + Neil:** capture the single upload —
   `~/backplanes-test-backup/capture.sh start` → `SSLKEYLOGFILE=… backplanes daemon run`
   (until it reports the session uploaded) → `capture.sh stop` (decodes to `decoded.txt`).
6. **Claude (Phase 3):** grep `decoded.txt` + the rendered report for every canary; score.

---

## Phase 1 (original method note) — Capture the egress (the part that makes this a real audit)

Reading only the *rendered report* tells you what Backplanes chose to **show you**, not what
it **sent**. To audit redaction honestly we need the actual upload payload.

**Primary: MITM the upload.**
- Run `mitmproxy`/`mitmdump` with its CA trusted, point the Backplanes CLI at it
  (`HTTPS_PROXY=http://127.0.0.1:8080`), and capture every request body it sends.
- If the CLI **cert-pins** (upload fails through the proxy), that itself is a finding
  (good for them, but means we fall back to the cache-inspection method). Record it.

**Fallback: pre-upload cache inspection.**
- Many such tools stage a redacted artifact locally before upload. Find it (Phase 0 step 5),
  and `grep -R CANARY7F3A` + each non-sentinel canary string against that artifact.

**Belt-and-suspenders: network sanity.**
- `sudo tcpdump`/`ss` to confirm which host(s) it talks to and that nothing goes out on an
  unexpected channel.

Decision gate: if we can capture **neither** the upload body nor a local pre-upload artifact,
the redaction audit degrades to "what survived into the rendered report" only — weaker, and
we should say so explicitly rather than overclaim.

---

## Phase 2 — Neil adds a feature to the demo (the live test)

Neil does normal feature work in `voygent-demo` with Backplanes capturing the session. To
exercise the redaction surface, the work should *naturally* cause the agent to:

- **Read** `.dev.vars` / `.env` (e.g. while wiring config) → exposes API key + bearers + URL.
- **Run bash that echoes secrets** (e.g. a curl with `Authorization: Bearer …`, a
  `wrangler secret` interaction, an `env | grep`).
- **Touch a PII-bearing record** (the planted fake client with email/phone/SSN/card).
- **Produce a git diff** and at least one tool result containing a tokened URL.

A real, small feature is fine (e.g. add a field to the demo's client card and render it) —
the point is that secret/PII exposure happens *as a side effect of real work*, the way it
would in an actual session, not as a contrived `echo $SECRET`.

After the feature is done and the Backplanes session report is generated, hand back to me
with: the rendered report (export/screenshot/text), the captured egress payload (Phase 1),
and the path to any local staging artifact.

---

## Phase 3 — I analyze (two scored deliverables)

### A. Redaction audit
- For each canary class, grep the **captured egress** (primary) and the **rendered report**
  for the sentinel / exact string. Build a recall table: `class → caught / leaked / not-present`.
- **Recall = caught / (caught + leaked)** over classes that actually appeared in the session.
- Classify every miss by type (key, bearer, private-key, tokened-URL, email, phone, SSN, card)
  — redactors commonly nail `sk-…` keys but miss tokened URLs, custom bearer prefixes, and
  free-text PII. Those misses are the real risk signal.
- Note any **partial** redaction (e.g. last 4 of a card left, host of a tokened URL left) —
  partials can still be sensitive.
- Verdict: would I trust this on a real `voygent-lite` session touching `voygent-prod` /
  shared KV / the un-rotated PAT? Yes/No/Conditional, with the conditions.

### B. Report-quality audit
- Compare the report's claims against ground truth: `git diff <startSHA>..HEAD`, the actual
  files changed, and what really happened in the session.
- Score: **accuracy** (does it confabulate steps that didn't happen / miss steps that did?),
  **usefulness** (does it tell Neil something his own handoff/`/pm`/Vestige stack doesn't?),
  **security-finding quality** (did its own "security concerns" section catch the canary
  exposure — and is that ironic given it then uploaded them?).

### C. Security-risk writeup
- What host(s) received data, what retention/deletion they offer, account/auth model.
- Blast radius if their backend is breached given what we observed leaving.
- Net recommendation: adopt / adopt-with-guardrails / avoid-on-credential-dense-repos, with
  the specific guardrails (e.g. "only on repos with no live secrets," "swap secrets to
  canaries is impractical day-to-day → therefore X").

---

## Phase 4 — Restore (non-negotiable cleanup)

1. `cp ~/backplanes-test-backup/.dev.vars.real .dev.vars` and same for `.env`.
2. Delete the planted PII record / `id_test` private-key file.
3. `git status` to confirm no canary or secret artifact is staged; the demo tree returns to
   its pre-test state (canary swaps were in gitignored files, so nothing should be committed —
   verify).
4. If the real `ANTHROPIC_API_KEY` was at any point exposed through the proxy during setup
   (it shouldn't be — Phase 0 swaps it first), **rotate it**.
5. Decide whether to **delete the uploaded session from Backplanes' servers** and confirm
   the deletion actually removes it (and document whether they let you verify that).

---

## Open decisions for Neil (answer before Phase 2)

1. **Secret handling during the test.** Plan assumes Phase 0 swaps real creds → canaries
   (safe; recommended). Alternative is testing with real secrets in place (more realistic,
   but a redaction miss burns a live key). Recommend the swap. Confirm.
2. **Egress capture method.** OK to run mitmproxy with a trusted local CA for the duration?
   If you'd rather not, we fall back to cache-inspection only and accept a weaker audit.
3. **Account.** Are you OK creating a Backplanes account / running their installer on this
   machine at all, given it reads session transcripts? (If not, the whole test is moot.)

## Pre-flight checklist (TodoWrite mirror)

- [ ] Phase 0: back up real `.dev.vars`/`.env`, swap to canaries, write `canaries.json`, snapshot start SHA
- [ ] Install Backplanes; locate its local cache/staging path; record version
- [ ] Phase 1: stand up egress capture (mitmproxy or cache-inspect); confirm we can see a payload
- [ ] Phase 2: Neil adds the feature with Backplanes capturing; touches secrets + PII naturally
- [ ] Phase 2: hand back rendered report + captured egress + staging path
- [ ] Phase 3A: redaction recall table + miss classification + trust verdict
- [ ] Phase 3B: report accuracy/usefulness vs git ground truth
- [ ] Phase 3C: security-risk writeup + adopt/avoid recommendation
- [ ] Phase 4: restore real secrets, delete planted artifacts, optional server-side deletion, rotate if needed
