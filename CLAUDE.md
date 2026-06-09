# voygent-demo — project instructions

Project-local guidance for the demo at `demo.voygent.ai`. The global `~/.claude/CLAUDE.md`
is the index; project-specific facts live here, in `docs/summaries/` handoffs, and in Vestige.

## Visual mockups / brainstorming companion — host on `demo.voygent.ai/mockups/`

This project does **not** use the superpowers localhost visual-companion server. Mockups are
published to the live demo's static mockup directory instead, so Neil reviews them at a real
`demo.voygent.ai` URL (same workflow used to ship the reel P1 directions).

**Location:** `web/public/mockups/<name>.html`  → served extensionless at
`https://demo.voygent.ai/mockups/<name>` (Cloudflare strips `.html` and redirects to the
extensionless path; that path returns 200).

**Publish workflow (one line):**

```
VITE_API_BASE="" npm run build:web && npx wrangler deploy
```

Then point Neil at `https://demo.voygent.ai/mockups/<name>`. Asset-only change — no worker,
secret, or D1 surface touched, so it deploys cleanly on top of whatever is live.

**Conventions:**
- Mockups are **throwaway static HTML** — self-contained (inline `<style>`), no build step,
  no React. The chosen direction gets reimplemented in `web/src/`.
- Match the skin you're mocking. Reel / chat surfaces are **claude-skin** — use these tokens
  (lifted from `web/public/mockups/reel-intro.html`, mirroring `web/src/skin-claude.css`):
  ```
  --cl-bg:#faf9f5; --cl-surface:#fff; --cl-user-bubble:#f0eee6;
  --cl-ink:#1f1e1c; --cl-ink-2:#3d3d3a; --cl-muted:#6b6a64; --cl-line:#e8e6dd;
  --cl-accent:#c96442; --cl-accent-ink:#fff; --cl-tool-bg:#f5f4ee;
  --cl-sans: ui-sans-serif,-apple-system,"Segoe UI",system-ui,sans-serif;
  --cl-serif: Georgia,"Iowan Old Style","Times New Roman",serif;
  --cl-mono:  ui-monospace,"SF Mono",Menlo,monospace;
  ```
  (The older `mockups/index.html` audience cuts use a different amber-CRT system via
  `_system.css` + `_chrome.js` — don't mix the two.)
- Copy voice: **no em-dashes, no over-polished "authored-by-AI" cadence** — plain sentences.
  (Memory: `feedback-demo-copy-voice-no-em-dash`.)
- Reuse a filename when iterating on the *same* mockup (overwrite + redeploy); use a new name
  for a genuinely different surface. Old reel mockups (`reel-intro|callouts|cta|inspector`)
  stay hosted and harmless.

**Smoke:** no headless Chrome in this env — Neil opens the URL in a browser to confirm. The
live demo itself is access-gated (passcode in repo `.env`, `DEMO_ACCESS_URL`); the
`/mockups/*` paths are not gated.
