// Shared shell for the worker-served info/brag pages (/info/*). Standalone
// HTML — no dependency on the SPA bundle — styled to match the demo's dark
// amber engineering aesthetic. Every page gets the same footer: resume +
// deep-dive links + back-to-demo (task 8: the demo IS an interactive resume).

export interface InfoPageMeta { slug: string; title: string; nav: string }

export const INFO_NAV: InfoPageMeta[] = [
  { slug: "bot-defeat",        title: "The bot-defeat saga",                nav: "bot-defeat" },
  { slug: "context-economics", title: "Context economics",                  nav: "context economics" },
  { slug: "record-replay",     title: "Record/replay engineering",          nav: "record/replay" },
  { slug: "cost-engineering",  title: "Cost engineering",                   nav: "cost engineering" },
  { slug: "production-system", title: "The system behind the demo",         nav: "the system" },
  { slug: "trip-integrity",    title: "Trip integrity",                     nav: "trip integrity" },
  { slug: "data-stores",       title: "KV, D1, and a SQL brain",            nav: "data stores" },
  { slug: "llm-options",       title: "Choosing the model",                 nav: "llm options" },
  { slug: "phase-machine",     title: "Keeping the model on track",         nav: "phase machine" },
  { slug: "subagents",         title: "Subagents for the drudge work",      nav: "subagents (soon)" },
  { slug: "resume",            title: "Neil Roberts — resume",              nav: "resume" },
];

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function renderInfoPage(meta: { title: string; subtitle?: string }, bodyHtml: string, activeSlug: string, editorHtml = ""): string {
  const navLinks = INFO_NAV
    .map((p) => p.slug === activeSlug
      ? `<span class="here">${esc(p.nav)}</span>`
      : `<a href="/info/${p.slug}">${esc(p.nav)}</a>`)
    .join(" · ");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.title)} · Voygent demo</title>
<style>
  :root { --bg:#0c0a07; --panel:#14110b; --ink:#efe7d6; --muted:#9a907c; --amber:#f5a623; --green:#3fb950; --line:#2a2316; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:400 16px/1.65 ui-sans-serif, system-ui, sans-serif; }
  .wrap { max-width: 760px; margin: 0 auto; padding: 32px 20px 64px; }
  header.top { display:flex; align-items:baseline; gap:12px; flex-wrap:wrap; margin-bottom: 8px; }
  header.top .brand { font-weight:700; }
  header.top .brand a { color:var(--ink); text-decoration:none; }
  header.top .sub { color:var(--muted); font-size:.875rem; }
  nav.crumbs { font: 500 .8125rem/1.6 ui-monospace, monospace; color:var(--muted); margin-bottom: 28px; }
  nav.crumbs a { color:var(--muted); } nav.crumbs a:hover { color:var(--amber); }
  nav.crumbs .here { color:var(--amber); }
  h1 { font-size: 1.75rem; line-height:1.25; margin: 0 0 6px; }
  .subtitle { color:var(--muted); margin: 0 0 28px; font-size: 1.0625rem; }
  h2 { font-size: 1.125rem; margin: 32px 0 8px; color: var(--amber); }
  h3 { font-size: 1rem; margin: 22px 0 6px; }
  p, li { color: #d9d2c2; }
  a { color: var(--amber); }
  code, .mono { font: 500 .875em ui-monospace, monospace; color: var(--green); }
  .artifact { font: 500 .75rem/1.5 ui-monospace, monospace; color: var(--muted); display:block; margin-top: 4px; }
  blockquote { margin: 16px 0; padding: 10px 16px; border-left: 3px solid var(--amber); background: var(--panel); color:#d9d2c2; }
  table { border-collapse: collapse; width: 100%; font-size: .875rem; margin: 12px 0; }
  th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--line); }
  th { color: var(--muted); font-weight: 600; }
  .stat { color: var(--green); font-weight: 600; }
  .cta { display:inline-block; margin-top: 8px; padding: 10px 16px; border:1px solid var(--amber); border-radius: 999px; color:var(--amber); text-decoration:none; font: 600 .875rem/1 ui-monospace, monospace; }
  .cta:hover { background: var(--amber); color: var(--bg); }
  footer.info { margin-top: 48px; padding-top: 16px; border-top: 1px solid var(--line); font: 500 .8125rem/1.8 ui-monospace, monospace; color: var(--muted); }
  footer.info a { color: var(--muted); } footer.info a:hover { color: var(--amber); }
  footer.info .built { margin-top: 6px; }
</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    <span class="brand"><a href="/">✳ Voygent</a></span>
    <span class="sub">demo · engineering notes</span>
  </header>
  <nav class="crumbs"><a href="/">← back to the demo</a> · <a href="/blog">notes</a> · ${navLinks}</nav>
  <h1 id="info-title">${esc(meta.title)}</h1>
  <p class="subtitle" id="info-subtitle">${meta.subtitle ? esc(meta.subtitle) : ""}</p>
  <div id="info-body">${bodyHtml}</div>
  <footer class="info">
    <div>${navLinks}</div>
    <div class="built">Voygent demo — designed, built, and operated by <a href="/info/resume">Neil Roberts</a> · <a href="/">watch it plan a real trip live →</a></div>
  </footer>
</div>
${editorHtml}
</body>
</html>`;
}
