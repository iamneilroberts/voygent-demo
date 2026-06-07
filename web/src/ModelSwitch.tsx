import { MODEL_LABELS, type ModelId } from "../../shared/models";
import type { SelectorMode } from "./lib/model";

// Global model selector — sits in the switch cluster (claude skin: Inspector
// head; board skin: page header), beside Advisor/Theme. Renders only enabled
// models (Opus appears only when the worker advertises it). "Smart" = per-phase
// routing (the map is edited in the Inspector body).
export function ModelSwitch(
  { mode, enabled, onPick }:
  { mode: SelectorMode; enabled: ModelId[]; onPick: (m: SelectorMode) => void },
) {
  const options: { id: SelectorMode; label: string }[] = [
    ...enabled.map((id) => ({ id: id as SelectorMode, label: MODEL_LABELS[id] })),
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
    </div>
  );
}
