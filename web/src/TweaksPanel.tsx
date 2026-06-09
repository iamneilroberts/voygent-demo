import { modelsByProvider, applyOptimize, type OptimizeKey } from "./lib/model";
import type { SelectorMode } from "./lib/model";
import type { ModelId, ModelRouting } from "../../shared/models";

// The fuller "Tweaks" surface: optimize-for presets + per-provider model groups
// (Local/Ollama shown grayed, never selectable). Compact ModelSwitch stays the
// quick switch; this is the expanded control. Stateless — App owns selection.
export function TweaksPanel(
  { open, onClose, enabled, mode, onMode, onRouting }:
  { open: boolean; onClose: () => void; enabled: ModelId[];
    mode: SelectorMode; onMode: (m: SelectorMode) => void;
    onRouting: (r: ModelRouting) => void },
) {
  if (!open) return null;
  const groups = modelsByProvider(enabled);
  const presets: { key: OptimizeKey; label: string; hint: string }[] = [
    { key: "speed", label: "Speed", hint: "fastest small model" },
    { key: "cost", label: "Cost", hint: "cheapest provider" },
    { key: "capability", label: "Capability", hint: "strongest on reasoning" },
  ];
  return (
    <div className="tweaks-panel" role="dialog" aria-label="Model tweaks">
      <div className="tweaks-head">
        <strong>Tweaks</strong>
        <button className="tweaks-close" onClick={onClose} aria-label="Close tweaks">✕</button>
      </div>

      <section className="tweaks-optimize">
        <span className="lab">optimize for</span>
        <div className="seg">
          {presets.map((p) => (
            <button key={p.key} type="button" title={p.hint}
              onClick={() => { const r = applyOptimize(p.key, enabled); onRouting(r); onMode(r.mode === "single" ? (r.model as SelectorMode) : "smart"); }}>
              {p.label}
            </button>
          ))}
        </div>
      </section>

      <section className="tweaks-providers">
        {groups.map((g) => (
          <div key={g.provider} className={`tweaks-group ${g.models.some((m) => m.enabledNow) ? "" : "is-disabled"}`}>
            <div className="tweaks-group-head">{g.label}</div>
            <div className="seg">
              {g.models.map((m) => (
                <button key={m.id} type="button"
                  disabled={!m.enabledNow}
                  aria-pressed={mode === m.id}
                  title={m.enabledNow ? `Drive the session with ${m.label}` : (m.reason ?? "Unavailable")}
                  onClick={() => m.enabledNow && onMode(m.id as SelectorMode)}>
                  {m.label}{!m.enabledNow ? " ·" : ""}
                </button>
              ))}
            </div>
            {g.provider === "ollama" && (
              <p className="tweaks-note">Local models can't run from this edge Worker.{" "}
                <a href="/info/llm-options" target="_blank" rel="noreferrer">why →</a></p>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
