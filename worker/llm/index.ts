import type { LLMProvider } from "./provider";
import { ClaudeProvider } from "./claude";
import { DeepSeekProvider } from "./deepseek";
import { OllamaProvider } from "./ollama";
import { providerOf } from "../../shared/models";

export interface ProviderEnv {
  ANTHROPIC_API_KEY: string;
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_BASE_URL?: string;
  DEMO_DEEPSEEK_ENABLED?: string;
  OLLAMA_BASE_URL?: string;
  DEMO_OLLAMA_URL?: string;
}

// Gates read only their own fields (not ANTHROPIC_API_KEY), so they accept any
// env shape carrying them — the DO Env and the top-level worker Env both qualify
// without an `as any` cast.
/** DeepSeek is live only when BOTH the key and the flag are present (R8). */
export function deepseekEnabled(env: { DEEPSEEK_API_KEY?: string; DEMO_DEEPSEEK_ENABLED?: string }): boolean {
  return !!env.DEEPSEEK_API_KEY && !!env.DEMO_DEEPSEEK_ENABLED;
}
export function ollamaEnabled(env: { OLLAMA_BASE_URL?: string; DEMO_OLLAMA_URL?: string }): boolean {
  return !!(env.OLLAMA_BASE_URL || env.DEMO_OLLAMA_URL);
}

// R8: never let a configurable base URL become a Worker-side fetch proxy. Allow
// only https, plus http ONLY for a localhost the caller explicitly allowlists.
// localhost is NOT a blanket carve-out — DeepSeek passes ["deepseek.com"], so a
// DEEPSEEK_BASE_URL=http://localhost:… is rejected and falls back to the real API
// (closes the SSRF hole where any caller's base URL could point at localhost).
// Exported for the security unit test.
export function safeBaseUrl(raw: string | undefined, fallback: string, allowHosts: string[]): string {
  if (!raw) return fallback;
  try {
    const u = new URL(raw);
    const isLocal = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    const okHost = allowHosts.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
    const okScheme = u.protocol === "https:" || (u.protocol === "http:" && isLocal && okHost);
    if (okScheme && okHost) return u.origin;
  } catch { /* fall through */ }
  return fallback;
}

/** Build the concrete provider for a model id. Falls back to Claude. */
export function providerFor(modelId: string, env: ProviderEnv): LLMProvider {
  const provider = providerOf(modelId);
  if (provider === "deepseek" && deepseekEnabled(env)) {
    const base = safeBaseUrl(env.DEEPSEEK_BASE_URL, "https://api.deepseek.com", ["deepseek.com"]);
    return new DeepSeekProvider(env.DEEPSEEK_API_KEY!, base, modelId);
  }
  if (provider === "ollama" && ollamaEnabled(env)) {
    const base = safeBaseUrl(env.OLLAMA_BASE_URL || env.DEMO_OLLAMA_URL, "http://localhost:11434", ["localhost"]);
    return new OllamaProvider(base, modelId);
  }
  return new ClaudeProvider(env.ANTHROPIC_API_KEY, modelId);
}
