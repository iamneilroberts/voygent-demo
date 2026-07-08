import { useState } from "react";
import type { Tier } from "./lib/access";

const field: React.CSSProperties = {
  width: "100%", padding: ".6rem", fontSize: "1rem", marginTop: ".5rem",
  border: "1px solid #ccc", borderRadius: 8, boxSizing: "border-box",
};

export function OnboardingForm({ apiBase, onAuthed, onHaveCode, onWantPro }: {
  apiBase: string;
  onAuthed: (tier: Tier) => void;
  onHaveCode: () => void;
  onWantPro: () => void;
}) {
  const [name, setName] = useState(""); const [email, setEmail] = useState("");
  const [role, setRole] = useState(""); const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const res = await fetch(`${apiBase}/onboard`, {
        method: "POST", headers: { "content-type": "application/json" }, credentials: "include",
        body: JSON.stringify({ name: name.trim(), email: email.trim(), role, note: note.trim() }),
      });
      if (res.status === 429) { setError("Too many signups from your network today. Try again tomorrow."); return; }
      if (!res.ok) { setError("Something went wrong. Please check your details and try again."); return; }
      const { code } = await res.json<{ code: string }>();
      // Auto-authenticate the issuing browser, then proceed to live.
      const a = await fetch(`${apiBase}/auth`, {
        method: "POST", headers: { "content-type": "application/json" }, credentials: "include",
        body: JSON.stringify({ code }),
      });
      const tier: Tier = a.ok ? ((await a.json<{ tier?: Tier }>().catch(() => ({} as { tier?: Tier }))).tier ?? "public") : "public";
      onAuthed(tier);
    } catch { setError("Network error. Please try again."); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ maxWidth: 420, margin: "10vh auto", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: "1.3rem", marginBottom: ".25rem" }}>Try the live Voygent demo</h1>
      <p style={{ color: "#666", marginTop: 0 }}>Free, instant access. Results come from public sources.</p>
      <form onSubmit={submit}>
        <input required placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} style={field} />
        <input required type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={field} />
        <select value={role} onChange={(e) => setRole(e.target.value)} style={field}>
          <option value="">Who are you? (optional)</option>
          <option value="travel-pro">Travel professional</option>
          <option value="tech-reviewer">Tech reviewer</option>
          <option value="curious">Just curious</option>
          <option value="other">Other</option>
        </select>
        <textarea placeholder="Any questions or comments? (optional)" value={note}
          onChange={(e) => setNote(e.target.value)} style={{ ...field, minHeight: 64 }} />
        <button disabled={busy || !name.trim() || !email.trim()}
          style={{ ...field, background: "#2b6", color: "#fff", border: 0, cursor: "pointer" }}>
          {busy ? "Setting up…" : "Start the live demo"}
        </button>
      </form>
      {error && <p style={{ color: "#c33", fontSize: ".85rem" }}>{error}</p>}
      <p style={{ color: "#888", fontSize: ".8rem" }}>
        We store your name + email to give you demo access and understand usage — ask us to delete it anytime.
      </p>
      <p style={{ fontSize: ".85rem" }}>
        <a href="#" onClick={(e) => { e.preventDefault(); onHaveCode(); }}>Already have a code?</a>
        {" · "}
        <a href="#" onClick={(e) => { e.preventDefault(); onWantPro(); }}>Want full credentialed access?</a>
      </p>
    </div>
  );
}
