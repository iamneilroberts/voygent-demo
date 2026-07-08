import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DRILLS, type DrillContext } from "./inspector-drills";

const costSim = DRILLS.find((d) => d.id === "costSim")!;

function ctxWith(partial: Partial<DrillContext>): DrillContext {
  return {
    actualCost: 0.41,
    cost: { haiku: 0.12, sonnet: 0.83, opus: 2.07 },
    actualByModel: {},
    routedModels: [],
    proWindow: null,
    freshTokens: 0,
    stats: null,
    ...partial,
  } as unknown as DrillContext;
}

describe("CostSimView (costSim drill)", () => {
  it("always shows the subscription framing note, with no em-dash", () => {
    const html = renderToStaticMarkup(costSim.render(ctxWith({})) as any);
    expect(html).toContain("You don&#x27;t pay per");
    expect(html).toContain("included in your subscription");
    expect(html).not.toContain("—"); // em-dash
  });

  it("shows which single model produced the observed cost", () => {
    const html = renderToStaticMarkup(costSim.render(ctxWith({
      routedModels: ["claude-sonnet-4-6"], actualByModel: { "claude-sonnet-4-6": 0.41 },
    })) as any);
    expect(html).toMatch(/Model:\s*Sonnet/);
  });

  it("shows a per-model breakdown when more than one model routed", () => {
    const html = renderToStaticMarkup(costSim.render(ctxWith({
      routedModels: ["claude-haiku-4-5", "claude-sonnet-4-6"],
      actualByModel: { "claude-haiku-4-5": 0.05, "claude-sonnet-4-6": 0.36 },
    })) as any);
    expect(html).toContain("Routed across:");
    expect(html).toContain("Haiku");
    expect(html).toContain("Sonnet");
  });
});
