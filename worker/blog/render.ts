// Blog landing (/blog): an auto-indexed list of the deep-dive posts plus an
// editable hero narrative. Posts are content.json entries flagged `blog: true`;
// the intro excerpt is derived from the first <p> of the body. Self-contained
// amber-CRT HTML (no SPA bundle), same standalone pattern as the /info pages.
import { editorChrome } from "../info/editor";
import type { PageData } from "../info/pages";

export interface RawEntry { title: string; subtitle?: string; body: string; blog?: boolean; tags?: string[] }
export interface BlogMeta { slug: string; title: string; subtitle: string; tags: string[]; intro: string }

const HERO_SLUG = "blog-home";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** First <p> of the body, inner HTML stripped to text and truncated. */
export function deriveIntro(body: string, max = 220): string {
  const m = body.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  if (!m) return "";
  const text = m[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  return text.length > max ? text.slice(0, max).replace(/\s+\S*$/, "") + "…" : text;
}

/** Every content.json entry flagged `blog: true`, as post metadata. Insertion order. */
export function collectPosts(content: Record<string, RawEntry>): BlogMeta[] {
  const posts: BlogMeta[] = [];
  for (const [slug, e] of Object.entries(content)) {
    if (!e || e.blog !== true) continue;
    posts.push({
      slug,
      title: e.title ?? slug,
      subtitle: e.subtitle ?? "",
      tags: Array.isArray(e.tags) ? e.tags : [],
      intro: deriveIntro(e.body ?? ""),
    });
  }
  return posts;
}

const FALLBACK_HERO: PageData = {
  title: "Voygent · engineering notes",
  subtitle: "Notes on the engineering behind Voygent: the dead ends, the decisions, and the numbers behind them.",
  body: "<p>The running write-up goes here. Open this page with <code>?edit=1</code> to start it.</p>",
};

export function renderBlog(hero: PageData | null, posts: BlogMeta[], opts: { withEditor?: boolean; edited?: boolean } = {}): string {
  const h = hero ?? FALLBACK_HERO;
  const tags = [...new Set(posts.flatMap((p) => p.tags))].sort();
  const editorHtml = opts.withEditor ? editorChrome(HERO_SLUG, !!opts.edited) : "";

  const cards = posts.map((p) => {
    const hay = `${p.title} ${p.subtitle} ${p.intro} ${p.tags.join(" ")}`.toLowerCase();
    return `<a class="post" href="/info/${esc(p.slug)}" data-search="${esc(hay)}" data-tags="${esc(p.tags.join(","))}">
      <div class="ptitle">${esc(p.title)}</div>
      <div class="ptags">${p.tags.map((t) => `<span>#${esc(t)}</span>`).join("")}</div>
      ${p.intro ? `<div class="pintro">${esc(p.intro)}</div>` : ""}
      <div class="pmeta"><span class="more">read →</span></div>
    </a>`;
  }).join("\n");

  const tagChips = tags.map((t) => `<span class="tag" data-tag="${esc(t)}">${esc(t)}</span>`).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(h.title)}</title>
<style>
  :root { --board:#0c0a07; --board-2:#14110c; --board-3:#1d1810; --ink:#efe7d6; --muted:#9a907c; --muted-2:#6f6757; --amber:#f5a623; --amber-hi:#ffcf6b; --green:#3fb950; --line:#26201a; }
  * { box-sizing:border-box; } body { margin:0; background:var(--board); color:var(--ink); font:400 16px/1.6 ui-sans-serif, system-ui, sans-serif; }
  a { color:var(--amber); text-decoration:none; } a:hover { color:var(--amber-hi); }
  .wrap { max-width:920px; margin:0 auto; padding:0 24px 64px; }
  header.top { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:14px 24px; border-bottom:1px solid var(--line); position:sticky; top:0; background:color-mix(in srgb, var(--board) 88%, transparent); backdrop-filter:blur(6px); z-index:5; flex-wrap:wrap; }
  header.top .brand { font-weight:700; } header.top .brand .star { color:var(--amber); }
  header.top nav { display:flex; gap:18px; font:500 .8125rem/1 ui-monospace, monospace; flex-wrap:wrap; }
  header.top nav a { color:var(--muted); } header.top nav a:hover { color:var(--amber); }
  .hero { padding:48px 0 24px; border-bottom:1px solid var(--line); position:relative; }
  .hero h1 { font-size:2.5rem; line-height:1.08; margin:0 0 12px; letter-spacing:-.5px; }
  .hero .subtitle { color:var(--muted); font-size:1.125rem; margin:0 0 24px; max-width:62ch; }
  #info-body { color:#d9d2c2; font-size:.9375rem; line-height:1.7; max-width:72ch; }
  #info-body p { margin:0 0 16px; } #info-body h2 { font-size:1.125rem; color:var(--amber); margin:28px 0 8px; }
  #info-body code, #info-body .mono { font:500 .875em ui-monospace, monospace; color:var(--green); }
  .controls { display:flex; gap:16px; align-items:center; flex-wrap:wrap; padding:24px 0 12px; }
  .search { flex:1; min-width:220px; display:flex; align-items:center; gap:8px; background:var(--board-2); border:1px solid var(--line); border-radius:8px; padding:10px 12px; }
  .search input { flex:1; background:transparent; border:0; color:var(--ink); font:500 .9375rem ui-sans-serif, system-ui, sans-serif; outline:none; }
  .count { color:var(--muted-2); font:500 .75rem ui-monospace, monospace; margin-left:auto; }
  .tagbar { display:flex; gap:8px; flex-wrap:wrap; padding-bottom:12px; }
  .tag { font:500 .75rem/1 ui-monospace, monospace; color:var(--muted); background:var(--board-2); border:1px solid var(--line); border-radius:999px; padding:5px 10px; cursor:pointer; }
  .tag:hover { color:var(--amber); } .tag.on { color:var(--board); background:var(--amber); border-color:var(--amber); }
  .posts { display:flex; flex-direction:column; gap:16px; padding-top:12px; }
  .post { display:block; padding:24px; border:1px solid var(--line); border-radius:8px; background:var(--board-2); transition:border-color .15s, transform .15s; }
  .post:hover { border-color:var(--amber); transform:translateY(-1px); }
  .post .ptitle { font-size:1.5rem; color:var(--ink); margin:0 0 6px; letter-spacing:-.2px; }
  .post .ptags { display:flex; gap:6px; flex-wrap:wrap; margin:0 0 12px; }
  .post .ptags span { font:500 .75rem/1 ui-monospace, monospace; color:var(--amber); opacity:.85; }
  .post .pintro { color:#cfc7b6; font-size:.9375rem; line-height:1.6; margin:0 0 12px; }
  .post .pmeta { font:500 .75rem ui-monospace, monospace; color:var(--muted-2); }
  .post .more { color:var(--amber); }
  .empty { color:var(--muted); padding:48px; text-align:center; }
  .pager { display:flex; justify-content:center; gap:8px; padding:32px 0; font:500 .8125rem ui-monospace, monospace; }
  .pager button { padding:6px 11px; border:1px solid var(--line); border-radius:8px; color:var(--muted); background:var(--board-2); cursor:pointer; }
  .pager button.cur { color:var(--board); background:var(--amber); border-color:var(--amber); }
  .pager button:disabled { opacity:.4; cursor:default; }
  footer.site { border-top:1px solid var(--line); padding:32px 0; margin-top:32px; display:flex; gap:48px; flex-wrap:wrap; color:var(--muted); font:500 .8125rem/1.7 ui-monospace, monospace; }
  footer.site h4 { color:var(--ink); font:600 .8125rem/1 ui-monospace, monospace; margin:0 0 8px; text-transform:uppercase; letter-spacing:.08em; }
  footer.site a { color:var(--muted); } footer.site a:hover { color:var(--amber); }
</style>
</head>
<body>
<header class="top">
  <span class="brand"><span class="star">✳</span> <a href="/blog" style="color:var(--ink)">Voygent · engineering notes</a></span>
  <nav>
    <a href="#posts">Deep dives</a>
    <a href="#bio">Bio</a>
    <a href="#contact">Contact</a>
    <a href="https://github.com/iamneilroberts" target="_blank" rel="noreferrer">GitHub ↗</a>
    <a href="/info/resume">Resume</a>
    <a href="/">Live demo →</a>
  </nav>
</header>
<div class="wrap">
  <section class="hero">
    <h1 id="info-title">${esc(h.title)}</h1>
    <p class="subtitle" id="info-subtitle">${esc(h.subtitle)}</p>
    <div id="info-body">${h.body}</div>
  </section>

  <div id="posts"></div>
  <div class="controls">
    <label class="search">🔍 <input id="q" type="text" placeholder="Search posts…" aria-label="Search posts"></label>
    <span class="count" id="count"></span>
  </div>
  <div class="tagbar" id="tagbar">${tagChips}</div>

  <div class="posts" id="list">
${cards || '<div class="empty">No posts yet.</div>'}
  </div>
  <div class="pager" id="pager"></div>

  <footer class="site">
    <div id="bio"><h4>Bio</h4>Neil Roberts<br>Forward-deployed / applied AI engineer<br>Building Voygent since Oct 2024.</div>
    <div id="contact"><h4>Contact</h4><a href="mailto:dneilroberts@gmail.com">dneilroberts@gmail.com</a><br><a href="/info/resume">resume</a></div>
    <div><h4>Code</h4><a href="https://github.com/iamneilroberts" target="_blank" rel="noreferrer">github.com/iamneilroberts</a><br><a href="/">live demo</a></div>
  </footer>
</div>
<script>
(function(){
  var PAGE=8, page=0, activeTag=null;
  var q=document.getElementById("q"), count=document.getElementById("count");
  var cards=[].slice.call(document.querySelectorAll(".post"));
  var tags=[].slice.call(document.querySelectorAll(".tag"));
  var pager=document.getElementById("pager");
  function matches(c){
    var s=(q.value||"").toLowerCase().trim();
    var okQ=!s||(c.getAttribute("data-search")||"").indexOf(s)>=0;
    var okT=!activeTag||(","+(c.getAttribute("data-tags")||"")+",").indexOf(","+activeTag+",")>=0;
    return okQ&&okT;
  }
  function apply(){
    var shown=cards.filter(matches);
    count.textContent=shown.length+" / "+cards.length+" posts";
    cards.forEach(function(c){ c.style.display="none"; });
    var pages=Math.max(1,Math.ceil(shown.length/PAGE));
    if(page>=pages) page=0;
    shown.slice(page*PAGE,page*PAGE+PAGE).forEach(function(c){ c.style.display="block"; });
    pager.innerHTML="";
    if(pages>1){
      var prev=document.createElement("button"); prev.textContent="← prev"; prev.disabled=page===0; prev.onclick=function(){page--;apply();};
      pager.appendChild(prev);
      for(var i=0;i<pages;i++){ (function(i){ var b=document.createElement("button"); b.textContent=i+1; if(i===page)b.className="cur"; b.onclick=function(){page=i;apply();}; pager.appendChild(b); })(i); }
      var next=document.createElement("button"); next.textContent="next →"; next.disabled=page>=pages-1; next.onclick=function(){page++;apply();};
      pager.appendChild(next);
    }
  }
  q.addEventListener("input",function(){page=0;apply();});
  tags.forEach(function(t){ t.addEventListener("click",function(){ var v=t.getAttribute("data-tag"); activeTag=activeTag===v?null:v; tags.forEach(function(x){x.classList.toggle("on",x.getAttribute("data-tag")===activeTag);}); page=0; apply(); }); });
  document.addEventListener("keydown",function(e){ if(e.key==="/"&&document.activeElement!==q){ e.preventDefault(); q.focus(); }});
  apply();
})();
</script>
${editorHtml}
</body>
</html>`;
}
