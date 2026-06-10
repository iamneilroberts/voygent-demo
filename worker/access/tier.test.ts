import { describe, it, expect } from "vitest";
import { pickBearer } from "./tier";

const env = { VOYGENT_MCP_BEARER: "public-bearer", VOYGENT_MCP_BEARER_PRO: "pro-bearer" };

describe("pickBearer", () => {
  it("returns the public bearer for public tier", () => {
    expect(pickBearer("public", env)).toBe("public-bearer");
  });
  it("returns the pro bearer for pro tier", () => {
    expect(pickBearer("pro", env)).toBe("pro-bearer");
  });
  it("returns null for pro tier when the pro bearer is unset (fail closed)", () => {
    expect(pickBearer("pro", { VOYGENT_MCP_BEARER: "public-bearer" })).toBeNull();
  });
});
