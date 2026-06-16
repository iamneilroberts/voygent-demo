import { describe, it, expect } from "vitest";
import { renderShowcasePage, renderModerationPage, renderShowcaseBody } from "./render";
import type { Section } from "./config";
import type { CommentRow } from "./comments";

const SECTIONS: Section[] = [
  { id: "overview", type: "overview", title: "Overview", enabled: true, order: 10, bodyHtml: "<p>Curated &amp; safe</p>" },
  { id: "hidden", type: "architecture", title: "Hidden", enabled: false, order: 20, bodyHtml: "<p>nope</p>" },
  { id: "buildlog", type: "buildlog", title: "Build log", enabled: true, order: 30 },
  { id: "comments", type: "comments", title: "Comments", enabled: true, order: 40 },
];

describe("renderShowcasePage", () => {
  it("renders only enabled sections, keeps curated HTML, and includes the honeypot form", () => {
    const html = renderShowcasePage({
      sections: SECTIONS,
      buildlog: [{ date: "2026-06-16", text: "shipped" }],
      comments: [],
      showComments: true,
    });
    expect(html).toContain("<p>Curated &amp; safe</p>");
    expect(html).not.toContain("nope");
    expect(html).toContain("2026-06-16");
    expect(html).toContain('name="website"');
    expect(html).toContain('action="/showcase/comments"');
  });

  it("escapes untrusted comment fields (escape-first, then <br>)", () => {
    const comments: CommentRow[] = [
      { id: "1", created_at: 1, author_name: '<b>x</b>', body: "line1\n<script>alert(1)</script>", section_ref: null },
    ];
    const html = renderShowcasePage({ sections: SECTIONS, buildlog: [], comments, showComments: true });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).toContain("line1<br>");
  });

  it("hides the comments section when showComments is false (graceful degrade)", () => {
    const html = renderShowcasePage({ sections: SECTIONS, buildlog: [], comments: [], showComments: false });
    expect(html).not.toContain('action="/showcase/comments"');
  });

  it("renders an empty body when no sections are enabled", () => {
    const body = renderShowcaseBody({ sections: [], buildlog: [], comments: [], showComments: true });
    expect(body).toBe("");
  });
});

describe("renderModerationPage", () => {
  it("escapes pending comment bodies/names on the admin page too", () => {
    const pending: CommentRow[] = [
      { id: "p1", created_at: 1, author_name: '"><img onerror=1>', body: "<script>1</script>", section_ref: "overview" },
    ];
    const html = renderModerationPage(pending);
    expect(html).not.toContain("<script>1</script>");
    expect(html).not.toContain("<img onerror=1>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("p1");
  });
});
