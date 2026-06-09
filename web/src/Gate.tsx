import { useState } from "react";

export function Gate({ initialCode, onSubmit }: { initialCode: string; onSubmit: (code: string) => Promise<boolean> }) {
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const ok = await onSubmit(code.trim());
    setBusy(false);
    if (!ok) setError("That passcode isn't valid. Check your invite link or ask for a new one.");
  }

  return (
    <div style={{ maxWidth: 360, margin: "12vh auto", textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: "1.3rem", marginBottom: ".25rem" }}>Voygent Demo</h1>
      <p style={{ color: "#666", marginTop: 0 }}>Enter your passcode to start.</p>
      <form onSubmit={submit}>
        <input
          autoFocus value={code} onChange={(e) => setCode(e.target.value)}
          placeholder="passcode" aria-label="passcode"
          style={{ width: "100%", padding: ".6rem", fontSize: "1rem", border: "1px solid #ccc", borderRadius: 8, boxSizing: "border-box" }}
        />
        <button disabled={busy || !code.trim()} style={{ marginTop: ".6rem", padding: ".55rem 1rem", border: 0, borderRadius: 8, background: "#2b6", color: "#fff", cursor: "pointer", width: "100%" }}>
          {busy ? "Checking…" : "Enter"}
        </button>
      </form>
      {error && <p style={{ color: "#c33", fontSize: ".85rem" }}>{error}</p>}
    </div>
  );
}
