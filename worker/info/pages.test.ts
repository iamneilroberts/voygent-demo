import { describe, it, expect } from "vitest";
import { infoPageHtml, getPageData, mergeOverride, renderInfo, isKnownSlug } from "./pages";

describe("infoPageHtml", () => {
  it("renders the data-stores page with the SQL-DBA mindshift section", () => {
    const html = infoPageHtml("data-stores");
    expect(html).not.toBeNull();
    expect(html!).toContain("KV");
    expect(html!).toContain("D1");
    expect(html!).toContain("career SQL DBA");
  });
  it("renders the llm-options page citing the provider seam", () => {
    const html = infoPageHtml("llm-options");
    expect(html).not.toBeNull();
    expect(html!).toContain("LLMProvider");
    expect(html!).toContain("Ollama");
  });
  it("renders the phase-machine page describing the state machine + cheap-model unlock", () => {
    const html = infoPageHtml("phase-machine");
    expect(html).not.toBeNull();
    expect(html!).toContain("advancePhase");
    expect(html!).toContain("DEMO_PHASE_MACHINE");
    expect(html!).toContain("Haiku");
  });
  it("renders the trip-integrity page hooking the validation panel + ADR-0006 guards", () => {
    const html = infoPageHtml("trip-integrity");
    expect(html).not.toBeNull();
    expect(html!).toContain("empty-decisions guard");
    expect(html!).toContain("consistencyWarnings");
    expect(html!).toContain("ADR-0006");
    expect(html!).toContain("sources:");
  });
  it("renders the subagents page (coming soon) grounded in the real offers agent", () => {
    const html = infoPageHtml("subagents");
    expect(html).not.toBeNull();
    expect(html!).toContain("EXAMINE");
    expect(html!).toContain("DRY_RUN");
    expect(html!).toContain("coming soon");
    expect(html!).toContain("sources:");
  });
  it("context-economics covers the consolidation wave + the ADR-0007 schema finding", () => {
    const html = infoPageHtml("context-economics");
    expect(html).not.toBeNull();
    expect(html!).toContain("cruise pilot");
    expect(html!).toContain("ADR-0007");
  });
  it("returns null for an unknown slug", () => {
    expect(infoPageHtml("nope")).toBeNull();
  });
});

describe("info override + editor rendering", () => {
  it("isKnownSlug is true for seeded pages, false otherwise", () => {
    expect(isKnownSlug("subagents")).toBe(true);
    expect(isKnownSlug("trip-integrity")).toBe(true);
    expect(isKnownSlug("nope")).toBe(false);
  });

  it("mergeOverride lets each non-null override field win, keeps defaults otherwise", () => {
    const def = getPageData("subagents")!;
    const merged = mergeOverride(def, {
      slug: "subagents", title: "Custom Title", subtitle: null, body: "<p>new body</p>", updated_at: 1,
    });
    expect(merged.title).toBe("Custom Title");
    expect(merged.subtitle).toBe(def.subtitle); // null override → default kept
    expect(merged.body).toBe("<p>new body</p>");
  });

  it("mergeOverride with no override returns the default unchanged", () => {
    const def = getPageData("subagents")!;
    expect(mergeOverride(def, null)).toEqual(def);
  });

  it("renderInfo without withEditor injects no editor chrome", () => {
    const html = renderInfo("subagents", getPageData("subagents")!);
    expect(html).not.toContain("info-editbar");
    expect(html).toContain('id="info-body"');
  });

  it("renderInfo with withEditor injects the editor and a save endpoint for the slug", () => {
    const html = renderInfo("subagents", getPageData("subagents")!, { withEditor: true, edited: true });
    expect(html).toContain("info-editbar");
    expect(html).toContain("/info/\" + encodeURIComponent(SLUG) + \"/save");
    expect(html).toContain("overridden"); // edited chip
    expect(html).toContain('id="info-title"');
    expect(html).toContain('id="info-subtitle"');
  });
});
