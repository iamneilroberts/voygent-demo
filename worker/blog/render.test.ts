import { describe, it, expect } from "vitest";
import { collectPosts, deriveIntro, renderBlog, type RawEntry } from "./render";

const content: Record<string, RawEntry> = {
  "context-economics-v2": {
    title: "Context economics", subtitle: "sub",
    body: "<p>Everything the model sees costs <code>context</code>. The levers.</p><p>second</p>",
    blog: true, tags: ["context", "tools"],
  },
  "bot-defeat": { title: "Bot defeat", subtitle: "s", body: "<p>not a post</p>" }, // blog not set
  "blog-home": { title: "Hero", subtitle: "h", body: "<p>hero body</p>", blog: false },
  "no-tags-v2": { title: "No tags", subtitle: "s", body: "<p>intro here</p>", blog: true },
};

describe("deriveIntro", () => {
  it("takes the first <p>, strips inner tags, decodes &amp;", () => {
    expect(deriveIntro("<p>Everything costs <code>context</code> &amp; time.</p><p>x</p>"))
      .toBe("Everything costs context & time.");
  });
  it("truncates long intros at a word boundary with an ellipsis", () => {
    const long = "<p>" + "word ".repeat(100) + "</p>";
    const out = deriveIntro(long, 40);
    expect(out.length).toBeLessThanOrEqual(41);
    expect(out.endsWith("…")).toBe(true);
  });
  it("returns empty string when there's no paragraph", () => {
    expect(deriveIntro("<h2>title only</h2>")).toBe("");
  });
});

describe("collectPosts", () => {
  it("returns only blog:true entries, with derived intro and defaulted tags", () => {
    const posts = collectPosts(content);
    const slugs = posts.map((p) => p.slug).sort();
    expect(slugs).toEqual(["context-economics-v2", "no-tags-v2"]); // bot-defeat + blog-home excluded
    const ce = posts.find((p) => p.slug === "context-economics-v2")!;
    expect(ce.tags).toEqual(["context", "tools"]);
    expect(ce.intro).toBe("Everything the model sees costs context. The levers.");
    expect(posts.find((p) => p.slug === "no-tags-v2")!.tags).toEqual([]);
  });
});

describe("renderBlog", () => {
  const posts = collectPosts(content);
  const hero = { title: "Hero", subtitle: "h", body: "<p>hero body</p>" };

  it("renders each post's title, tags, intro, and /info link", () => {
    const html = renderBlog(hero, posts);
    expect(html).toContain('href="/info/context-economics-v2"');
    expect(html).toContain("#context");
    expect(html).toContain("Everything the model sees costs context");
    expect(html).toContain("hero body"); // hero injected
    expect(html).toContain('id="q"'); // search
    expect(html).toContain('data-tag="context"'); // tag chip
  });

  it("injects the editor chrome only when withEditor is set (slug blog-home)", () => {
    expect(renderBlog(hero, posts, { withEditor: true }).includes("info-editbar")).toBe(true);
    expect(renderBlog(hero, posts).includes("info-editbar")).toBe(false);
  });

  it("falls back to a placeholder hero when hero is null (never 500s)", () => {
    const html = renderBlog(null, posts);
    expect(html).toContain("Voygent · engineering notes");
  });

  it("shows an empty state when there are no posts", () => {
    expect(renderBlog(hero, []).includes("No posts yet")).toBe(true);
  });
});
