import { useState } from "react";
import { Prose } from "./prose";

export interface ChatMessage { role: "user" | "assistant"; text: string; }
export interface Preset { id: string; label: string; city: string; origin: string; subtitle: string; prompt: string; }

function Welcome({ presets, geoCity, onSend, busy }: { presets: Preset[]; geoCity: string | null; onSend: (m: string) => void; busy: boolean }) {
  return (
    <div className="welcome">
      <h1 className="welcome-h">Where would you like to go?</h1>
      <p className="welcome-sub">
        {geoCity ? <>Hi from {geoCity} 👋 — </> : null}
        Pick a trip and watch Voygent build it live with real flights and hotels, or just tell me what you're dreaming up.
      </p>
      {presets.length > 0 && (
        <div className="presets">
          {presets.map((p) => (
            <button key={p.id} className="preset" disabled={busy} onClick={() => onSend(p.prompt)}>
              <span className="preset-label">{p.label}</span>
              <span className="preset-sub">{p.subtitle}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ChatView(
  { messages, tools, onSend, busy, presets, geoCity }:
  { messages: ChatMessage[]; tools: string[]; onSend: (m: string) => void; busy: boolean; presets: Preset[]; geoCity: string | null },
) {
  const [input, setInput] = useState("");
  const firstRun = messages.length === 0;
  return (
    <main className="chat">
      <div className="messages">
        {firstRun && <Welcome presets={presets} geoCity={geoCity} onSend={onSend} busy={busy} />}
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.role !== "assistant" ? m.text
              : m.text ? <Prose text={m.text} />
              : busy ? <span className="typing"><i /><i /><i /></span>
              : null}
          </div>
        ))}
        {tools.length > 0 && <div className="tools">{tools.map((t, i) => <span key={i} className="chip">⚙ voygent · {t}</span>)}</div>}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (input.trim()) { onSend(input); setInput(""); } }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Plan a trip to Cancún…" disabled={busy} />
        <button disabled={busy}>Send</button>
      </form>
    </main>
  );
}
