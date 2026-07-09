# Backplanes Spotlight — Independent Redaction & Reporting Assessment

**To:** Backplanes Inc. (Spotlight / Collector team)
**From:** Neil Roberts, Voygent
**Date:** 2026-06-18
**Product version tested:** `backplanes` CLI v2.3.0 (build f012ec6, 2026-06-17), Linux x86_64
**Classification:** Responsible disclosure — privacy/redaction. Shared privately.

---

## 1. Summary

We evaluated Backplanes Spotlight before adopting it across credential- and PII-heavy
repositories. The evaluation captured the exact payload the CLI transmits to
`api.backplanes.com` and compared it against a controlled set of planted, **synthetic** test
secrets and PII; separately, we assessed the generated session report against ground truth.

Overall impression: the installer and CLI are well-engineered, and the documented scoping
controls work. We found one issue we consider material for any customer handling regulated data,
plus a few smaller observations about the reporting layer:

- **Primary:** client-side redaction covers email only. Phone numbers, U.S. SSNs, and
  credit-card numbers present in files the agent read were transmitted to your servers in
  cleartext — inconsistent with the statement that local redaction "strips PII and credentials
  before anything leaves your laptop."
- **Secondary:** the session report's security view appears to key off the same narrow detector,
  so it can read as "clean" on data it actually transmitted un-redacted; and the report applies a
  "pull request / CI" framing to sessions with no git activity.

All test values were synthetic; no live credentials were exposed. Details and evidence below, in
the spirit of helping you close the gap.

---

## 2. Scope and methodology

- **Repository:** an isolated test project. Real credentials were swapped for uniquely-tagged
  synthetic canaries beforehand, so the test itself could never expose a live secret.
- **Planted test data**, placed in files the agent would read during a small, realistic feature
  task: an Anthropic-style API key, a bearer token, an AWS-style access key, a generic password,
  a private-key block, an access-code URL, and a PII record with a test email, phone, SSN, and a
  canonical test card number (`4111-1111-1111-1111`).
- **Session:** a normal Claude Code session implementing a small worker feature that, as a side
  effect, read the config files and the PII record — representative of everyday use.
- **Capture:** We recorded the exact bytes leaving the host. The upload is gRPC over TLS and is
  not interceptable via `SSLKEYLOGFILE` (key-logging is not wired on the upload path). We
  therefore reconstructed the payload from the CLI's own pre-upload staging file
  (`…/daemon/.upload-tmp/upload-<pid>-…jsonl`) — the redacted transcript exactly as the daemon
  serialized it for transmission (204,465 bytes, 109 records).
- **Configuration:** We used `backplanes login` plus a scoped `config.toml` and an isolated
  config dir so that only the single test session was transmitted, and disabled telemetry. None
  of these choices affect the redaction path (they affect only *which* sessions upload), so they
  do not bias the redaction results.

---

## 3. Findings

### Finding 1 — Client-side redaction is limited to email; other PII is transmitted in cleartext (Material)

In the transmitted payload, the only redaction token anywhere in the 204KB document is
`[REDACTED:pii-email]`. Within the **same JSON object** read from the test PII record, the email
was redacted but the adjacent fields were not:

```
"email":      "[REDACTED:pii-email]",   ← redacted
"phone":      "+1-555-867-5309",         ← transmitted in cleartext
"ssn":        "078-05-1120",             ← transmitted in cleartext
"creditCard": "4111-1111-1111-1111"      ← transmitted in cleartext
```

`4111-1111-1111-1111` is a canonical, Luhn-valid test card; the SSN and phone are
standard-format values. Static analysis is consistent with this: the binary contains a dedicated
email regex and vendored gitleaks rules, but no phone/SSN/credit-card detectors.

We note your installer states a "second, more robust heuristic-based PII scrub" runs
**server-side**, and indeed the rendered dashboard report did not surface the SSN or card — so
this PII may well be removed before storage/display. Our finding is specifically about the
**transit** wording ("before anything leaves your laptop"): for these PII categories, the data
does leave the device before it is scrubbed.

### Finding 2 — The report's security view can read "clean" on data it transmitted un-redacted (Minor)

The report's behavioral checks (auth/access, external services, production config, sandbox,
skills) appear to assess what the agent *did*, and marking them clean is reasonable; it also
correctly flagged the credential/PII category ("Watch credential ops"). Our observation is
narrower: the manager-facing summary states "no credential leaks detected," and the security view
seems to surface only what the redactor matched (email). Because the local detector is narrow
(Finding 1), in a real session containing live secrets the same logic could both transmit and
under-report them. (In our test, all planted credentials were synthetic, so no live credential
actually leaked.) Suggestion: distinguish "evaluated and clear" from "not evaluated," and avoid
unqualified "no credential leaks" phrasing for categories the local detector does not cover.

### Finding 3 — "Pull request / CI" framing applied to sessions with no git activity (Cosmetic)

The report presented "1 PR touched / Opened" and a "Pull requests & CI" section for a session
whose only git action was staging a local changeset — no commit, push, or pull request (the
report's own footnotes record 0 pushes / 0 PR interactions and note it is "not bound to a specific
PR"). We read this as a presentation metaphor rather than a factual error, but the "Opened" /
"PR touched" labels overstate what happened and could mislead a manager skimming the summary.

### Finding 4 — Default onboarding uploads cross-project history (Worth surfacing)

`backplanes wizard` — the flow the installer points users to ("Run `backplanes` to finish setup")
— is described as "sign in **and upload history**," and the daemon by default watches the entire
`~/.claude` tree (transcripts across all of a user's projects). A user following the advertised
path would transmit their full multi-project history. Effective scoping controls exist
(`config.toml`, custom config dirs, `backfill_after_unix`) but aren't surfaced in the default
flow.

---

## 4. What worked well

- Clean installer: checksum-verified GitHub-release binary, no `sudo`, no opaque remote execution.
- Solid plumbing: resumable, batched, content-fingerprinted upload pipeline; atomic temp-file
  writes; daemon lock/lifecycle; systemd integration. This is competent systems engineering.
- Telemetry is opt-in and, per its disclosure, excludes transcripts/paths/secrets; easily disabled.
- Scoping controls function correctly.
- Email redaction works reliably.

---

## 5. Limitations of this assessment

- The API-key, AWS, and GitHub-token canaries were **not** in the exact formats your gitleaks
  rules expect (e.g., a non-standard trailing length on the AWS key). Their appearance in the
  payload is therefore **not** a fair test of your credential scrubber, and we are **not** claiming
  the credential rules failed. Finding 1 rests entirely on the format-valid PII result.
- One test document we authored was itself read by the agent and contained a copy of our canary
  table, so some canary occurrences in the payload originate there; the decisive PII evidence in
  Finding 1 comes directly from the PII record and is unaffected.

---

## 6. Suggestions

1. Extend client-side PII detection beyond email to at least phone, SSN, and credit-card (Luhn)
   patterns performed before transmission — or adjust the "strips PII … before anything leaves
   your laptop" wording to reflect that some PII categories are scrubbed server-side.
2. Make the report's security wording conservative: separate "evaluated and clear" from "not
   evaluated."
3. Report only git/PR activity actually observed (the footnotes already track the correct zero
   counts).
4. Surface scope selection in the default onboarding flow before any history upload.

---

## 7. Cleanup request

The test session and its payload (containing the synthetic PII above) were uploaded to our
Backplanes account during this evaluation. We'd appreciate confirmation of your data-deletion
process and whether deletion is independently verifiable.

We're happy to share the reconstructed payload or binary-analysis notes, or to re-run with
correctly-formatted credential canaries, if useful for validating fixes.

*Prepared with synthetic test data only. Contact: dneilroberts@gmail.com.*
