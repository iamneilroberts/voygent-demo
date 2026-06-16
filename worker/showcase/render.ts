import { renderInfoPage, esc } from "../info/layout";
import { enabledSections, type Section } from "./config";
import type { BuildLogEntry } from "./buildlog";
import type { CommentRow } from "./comments";

/** Escape FIRST, then turn newlines into <br>. Never the reverse. */
function escMultiline(s: string): string {
  return esc(s).replace(/\n/g, "<br>");
}

/**
 * Attribute-context escaping: the shared esc() escapes &<> but NOT quotes, so it is
 * unsafe for `attr="${value}"`. Use this for any value interpolated into an HTML
 * attribute. (Today the only interpolated attrs are server UUIDs / trusted section ids,
 * so this is defense-in-depth, but it keeps the helper correct for future values.)
 */
function escAttr(s: string): string {
  return esc(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function buildlogHtml(entries: BuildLogEntry[]): string {
  if (entries.length === 0) return "<p>No build-log entries yet.</p>";
  const items = entries
    .map((e) => `<li><span class="stat">${esc(e.date)}</span> ${esc(e.text)}</li>`)
    .join("");
  return `<ul class="buildlog">${items}</ul>`;
}

function commentsHtml(comments: CommentRow[]): string {
  const list =
    comments.length === 0
      ? "<p>No comments yet — be the first.</p>"
      : `<ul class="comments">${comments
          .map(
            (c) =>
              `<li><strong>${esc(c.author_name)}</strong><div>${escMultiline(c.body)}</div></li>`,
          )
          .join("")}</ul>`;
  // Plain HTML form (no JS) -> /showcase CSP can keep script-src 'none'.
  const form = `
    <form method="POST" action="/showcase/comments" class="comment-form">
      <label>Name <input type="text" name="name" maxlength="80" required></label>
      <label>Comment <textarea name="body" maxlength="2000" required></textarea></label>
      <input type="text" name="website" autocomplete="off" tabindex="-1"
             aria-hidden="true" style="position:absolute;left:-9999px">
      <button type="submit">Submit for review</button>
      <p class="note">Comments are held for review before they appear.</p>
    </form>`;
  return list + form;
}

function sectionHtml(s: Section, buildlog: BuildLogEntry[], comments: CommentRow[], showComments: boolean): string {
  let inner: string;
  switch (s.type) {
    case "buildlog":
      inner = buildlogHtml(buildlog);
      break;
    case "comments":
      if (!showComments) return "";
      inner = commentsHtml(comments);
      break;
    default:
      // Curated, author-trusted HTML — intentionally NOT escaped.
      inner = s.bodyHtml ?? "";
  }
  return `<section id="${escAttr(s.id)}"><h2>${esc(s.title)}</h2>${inner}</section>`;
}

export interface ShowcaseRenderInput {
  sections: Section[];
  buildlog: BuildLogEntry[];
  comments: CommentRow[];
  showComments: boolean;
}

/**
 * Body-only composition (the showcase's OWN content: curated sections + build-log +
 * comments). Exposed separately so the no-leak test asserts against exactly the
 * showcase-controlled source allowlist, NOT the shared site chrome that renderInfoPage
 * adds (its nav legitimately contains words like "cost engineering", already public on
 * /info — an allowed source, not a leak).
 */
export function renderShowcaseBody(input: ShowcaseRenderInput): string {
  return enabledSections(input.sections)
    .map((s) => sectionHtml(s, input.buildlog, input.comments, input.showComments))
    .join("\n");
}

export function renderShowcasePage(input: ShowcaseRenderInput): string {
  return renderInfoPage(
    { title: "Follow the build", subtitle: "Voygent — public showcase" },
    renderShowcaseBody(input),
    "showcase",
  );
}

export function renderModerationPage(pending: CommentRow[]): string {
  const rows =
    pending.length === 0
      ? "<p>No pending comments.</p>"
      : pending
          .map(
            (c) => `
      <div class="pending" data-id="${escAttr(c.id)}">
        <strong>${esc(c.author_name)}</strong>
        ${c.section_ref ? `<em>on ${esc(c.section_ref)}</em>` : ""}
        <div>${escMultiline(c.body)}</div>
        <button class="approve" data-id="${escAttr(c.id)}">Approve</button>
        <button class="reject" data-id="${escAttr(c.id)}">Reject</button>
      </div>`,
          )
          .join("");
  // Admin surface (not the public /showcase) — fetch()+JSON moderation, mirroring the
  // existing in-place editor. Origin + application/json content-type = CSRF defense.
  const script = `
    <script>
      document.querySelectorAll('.approve,.reject').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          var id = btn.getAttribute('data-id');
          var action = btn.classList.contains('approve') ? 'approve' : 'reject';
          var res = await fetch('/admin/comments/' + encodeURIComponent(id) + '/' + action, {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}'
          });
          if (res.ok) { var el = btn.closest('.pending'); if (el) el.remove(); }
          else { alert('Action failed (' + res.status + ')'); }
        });
      });
    </script>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Moderate comments</title></head>
    <body><h1>Pending comments</h1>${rows}${script}</body></html>`;
}
