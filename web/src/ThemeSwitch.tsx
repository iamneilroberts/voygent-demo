import { useEffect, useState } from "react";
import { THEME_IDS, type ThemeId, applyTheme, loadTheme } from "./lib/theme";

// Discreet 5-palette switcher. Amber is the default; the pick persists to
// localStorage and is restored on mount. Uses the `.theme-switch` primitive from
// theme.css. Each swatch shows the palette's board colour split with its accent.
const SWATCH: Record<ThemeId, { a: string; b: string }> = {
  amber:    { a: "#0c0a07", b: "#f5a623" },
  phosphor: { a: "#050a06", b: "#3fb950" },
  sodium:   { a: "#0c0a07", b: "#ff8c42" },
  dusk:     { a: "#15101b", b: "#ff9e64" },
  paper:    { a: "#f4f0e6", b: "#c2611c" },
};

export function ThemeSwitch() {
  const [theme, setTheme] = useState<ThemeId>("amber");

  // Restore persisted theme on mount.
  useEffect(() => { const t = loadTheme(); setTheme(t); applyTheme(t); }, []);

  function pick(id: ThemeId) { setTheme(id); applyTheme(id); }

  return (
    <div className="theme-switch" role="group" aria-label="Colour theme">
      <span className="lab">theme</span>
      {THEME_IDS.map((id) => (
        <button
          key={id}
          type="button"
          aria-pressed={theme === id}
          onClick={() => pick(id)}
          title={id}
        >
          <span className="sw" style={{ ["--a" as string]: SWATCH[id].a, ["--b" as string]: SWATCH[id].b }} />
          {id}
        </button>
      ))}
    </div>
  );
}
