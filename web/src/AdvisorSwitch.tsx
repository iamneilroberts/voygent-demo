// Traveler/advisor view toggle. Reuses the `.theme-switch` chrome primitive so
// it reads as demo harness, not product. Advisor view surfaces commission on
// boards + folio (real cpmaxx data only — see lib/advisor.ts).
export function AdvisorSwitch({ on, onToggle }: { on: boolean; onToggle: (on: boolean) => void }) {
  return (
    <div className="theme-switch advisor-switch" role="group" aria-label="View as">
      <span className="lab">view</span>
      <button type="button" aria-pressed={!on} onClick={() => onToggle(false)} title="Traveler view — no commission shown">
        traveler
      </button>
      <button type="button" aria-pressed={on} onClick={() => onToggle(true)} title="Advisor view — shows commission per item + trip total (real supplier data only)">
        advisor $
      </button>
    </div>
  );
}
