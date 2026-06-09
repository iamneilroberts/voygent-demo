import { MODEL_LABELS, modelEntry, type ModelId } from "../../shared/models";
import type { SelectorMode } from "./lib/model";

// Global model selector — sits in the switch cluster (claude skin: Inspector
// head; board skin: page header), beside Advisor/Theme. Renders only enabled
// models (Opus appears only when the worker advertises it). "Smart" = per-phase
// routing (the map is edited in the Inspector body). The ⚙ opens the fuller
// Tweaks panel (provider groups + optimize presets).
export function ModelSwitch(
  { mode, enabled, onPick, onTweaks }:
  { mode: SelectorMode; enabled: ModelId[]; onPick: (m: SelectorMode) => void; onTweaks?: () => void },
) {
  // MODEL_LABELS only carries the Claude trio; fall back to the registry label
  // (then the raw id) so a non-Claude enabled model — e.g. DeepSeek — still reads.
  const labelFor = (id: ModelId): string => MODEL_LABELS[id] ?? modelEntry(id)?.label ?? id;
  const options: { id: SelectorMode; label: string }[] = [
    ...enabled.map((id) => ({ id: id as SelectorMode, label: labelFor(id) })),
    { id: "smart" as SelectorMode, label: "Smart" },
  ];
  return (
    <div className="theme-switch model-switch" role="group" aria-label="Model">
      <span className="lab">model</span>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={mode === o.id}
          onClick={() => onPick(o.id)}
          title={o.id === "smart" ? "Voygent smart routing — a model per trip phase (editable below)" : `Drive the whole session with ${o.label}`}
        >
          {o.label}
        </button>
      ))}
      {onTweaks && (
        <button type="button" className="model-tweaks" title="More model options" onClick={onTweaks} aria-label="Open model tweaks">⚙</button>
      )}
    </div>
  );
}
