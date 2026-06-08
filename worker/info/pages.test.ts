import { describe, it, expect } from "vitest";
import { infoPageHtml } from "./pages";

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
  it("returns null for an unknown slug", () => {
    expect(infoPageHtml("nope")).toBeNull();
  });
});
