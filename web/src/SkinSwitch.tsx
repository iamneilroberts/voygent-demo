import { SKIN_IDS, type SkinId } from "./lib/skin";

// Discreet fixed bottom-right skin toggle ("board | claude"). Floats above both
// skins so it stays reachable even while the Inspector idles as a thin rail.
// Styled as engineering chrome (mono, dark) so it never pollutes the claude
// illusion — it reads as part of the demo harness, not the product.
const LABEL: Record<SkinId, string> = { board: "board", claude: "claude.ai" };

export function SkinSwitch({ skin, onPick }: { skin: SkinId; onPick: (id: SkinId) => void }) {
  return (
    <div className="skin-switch" role="group" aria-label="Demo skin">
      <span className="lab">skin</span>
      {SKIN_IDS.map((id) => (
        <button key={id} type="button" aria-pressed={skin === id} onClick={() => onPick(id)} title={`Switch to the ${LABEL[id]} skin`}>
          {LABEL[id]}
        </button>
      ))}
    </div>
  );
}
