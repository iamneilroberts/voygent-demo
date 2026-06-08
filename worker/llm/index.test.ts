import { describe, it, expect } from "vitest";
import { safeBaseUrl, deepseekEnabled, ollamaEnabled } from "./index";

describe("safeBaseUrl (SSRF allowlist)", () => {
  it("accepts an https URL on an allowlisted host", () => {
    expect(safeBaseUrl("https://api.deepseek.com/v1", "https://api.deepseek.com", ["deepseek.com"])).toBe("https://api.deepseek.com");
  });
  it("rejects a localhost base when localhost is NOT allowlisted (DeepSeek) — closes the SSRF carve-out", () => {
    expect(safeBaseUrl("http://localhost:1234", "https://api.deepseek.com", ["deepseek.com"])).toBe("https://api.deepseek.com");
    expect(safeBaseUrl("http://127.0.0.1:1234", "https://api.deepseek.com", ["deepseek.com"])).toBe("https://api.deepseek.com");
  });
  it("rejects a non-allowlisted https host", () => {
    expect(safeBaseUrl("https://evil.example", "https://api.deepseek.com", ["deepseek.com"])).toBe("https://api.deepseek.com");
  });
  it("allows http://localhost ONLY when the caller allowlists localhost (Ollama, local-dev)", () => {
    expect(safeBaseUrl("http://localhost:11434", "http://localhost:11434", ["localhost"])).toBe("http://localhost:11434");
  });
  it("falls back on empty or malformed input", () => {
    expect(safeBaseUrl(undefined, "https://api.deepseek.com", ["deepseek.com"])).toBe("https://api.deepseek.com");
    expect(safeBaseUrl("not a url", "https://api.deepseek.com", ["deepseek.com"])).toBe("https://api.deepseek.com");
  });
});

describe("provider gates", () => {
  it("deepseek requires BOTH key and flag (R8 dual gate)", () => {
    expect(deepseekEnabled({})).toBe(false);
    expect(deepseekEnabled({ DEEPSEEK_API_KEY: "k" })).toBe(false);
    expect(deepseekEnabled({ DEMO_DEEPSEEK_ENABLED: "1" })).toBe(false);
    expect(deepseekEnabled({ DEEPSEEK_API_KEY: "k", DEMO_DEEPSEEK_ENABLED: "1" })).toBe(true);
  });
  it("ollama is off unless a base URL is configured (local-dev only)", () => {
    expect(ollamaEnabled({})).toBe(false);
    expect(ollamaEnabled({ OLLAMA_BASE_URL: "http://localhost:11434" })).toBe(true);
  });
});
