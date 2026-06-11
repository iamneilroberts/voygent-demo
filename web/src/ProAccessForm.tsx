import { useState } from "react";

export function ProAccessForm({ apiBase, onDone }: { apiBase: string; onDone: () => void }) {
  const [f, setF] = useState({ name: "", email: "", company: "", role: "", useCase: "", note: "" });
  const [busy, setBusy] = useState(false); const [sent, setSent] = useState(false); const [error, setError] = useState("");
  const set = (k: keyof typeof f) => (e: any) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const res = await fetch(`${apiBase}/pro-request`, {
        method: "POST", headers: { "content-type": "application/json" }, credentials: "include",
        body: JSON.stringify(f),
      });
      if (!res.ok) { setError("Couldn't submit. Check your details and try again."); return; }
      setSent(true);
    } catch { setError("Network error. Please try again."); } finally { setBusy(false); }
  }

  if (sent) return (
    <div style={{ maxWidth: 440, margin: "12vh auto", fontFamily: "system-ui", textAlign: "center" }}>
      <h2>Thanks — request received</h2>
      <p style={{ color: "#666" }}>Neil will review and email you a credentialed access code.</p>
      <button onClick={onDone} style={btn}>Back to the demo</button>
    </div>
  );

  return (
    <div style={{ maxWidth: 440, margin: "8vh auto", fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: "1.3rem" }}>Request full (credentialed) access</h1>
      <p style={{ color: "#666", marginTop: 0 }}>For travel pros &amp; partners — build real trips with live supplier data. Neil reviews each request.</p>
      <form onSubmit={submit}>
        <input required placeholder="Name" value={f.name} onChange={set("name")} style={field} />
        <input required type="email" placeholder="Email" value={f.email} onChange={set("email")} style={field} />
        <input placeholder="Company / agency" value={f.company} onChange={set("company")} style={field} />
        <input placeholder="Your role" value={f.role} onChange={set("role")} style={field} />
        <textarea placeholder="What do you want to evaluate?" value={f.useCase} onChange={set("useCase")} style={{ ...field, minHeight: 64 }} />
        <textarea placeholder="Anything else? (optional)" value={f.note} onChange={set("note")} style={{ ...field, minHeight: 48 }} />
        <button disabled={busy || !f.name.trim() || !f.email.trim()} style={{ ...btn, width: "100%" }}>
          {busy ? "Submitting…" : "Request access"}
        </button>
      </form>
      {error && <p style={{ color: "#c33", fontSize: ".85rem" }}>{error}</p>}
      <p style={{ fontSize: ".85rem" }}><a href="#" onClick={(e) => { e.preventDefault(); onDone(); }}>← Back</a></p>
    </div>
  );
}
const field: React.CSSProperties = { width: "100%", padding: ".6rem", fontSize: "1rem", marginTop: ".5rem", border: "1px solid #ccc", borderRadius: 8, boxSizing: "border-box" };
const btn: React.CSSProperties = { padding: ".55rem 1rem", border: 0, borderRadius: 8, background: "#2b6", color: "#fff", cursor: "pointer", marginTop: ".6rem" };
