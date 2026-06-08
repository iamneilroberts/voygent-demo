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

/** DeepSeek is live only when BOTH the key and the flag are present (R8). */
export function deepseekEnabled(env: ProviderEnv): boolean {
  return !!env.DEEPSEEK_API_KEY && !!env.DEMO_DEEPSEEK_ENABLED;
}
export function ollamaEnabled(env: ProviderEnv): boolean {
  return !!(env.OLLAMA_BASE_URL || env.DEMO_OLLAMA_URL);
}

// R8: never let a configurable base URL become a Worker-side fetch proxy. Allow
// only https (or http for localhost dev) and a known host suffix.
function safeBaseUrl(raw: string | undefined, fallback: string, allowHosts: string[]): string {
  if (!raw) return fallback;
  try {
    const u = new URL(raw);
    const okScheme = u.protocol === "https:" || (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1"));
    const okHost = allowHosts.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`)) || u.hostname === "localhost" || u.hostname === "127.0.0.1";
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
