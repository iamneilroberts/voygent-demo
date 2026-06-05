import { useState } from "react";
import { Prose } from "./prose";

export interface ChatMessage { role: "user" | "assistant"; text: string; }
export function ChatView(
  { messages, tools, onSend, busy }: { messages: ChatMessage[]; tools: string[]; onSend: (m: string) => void; busy: boolean },
) {
  const [input, setInput] = useState("");
  return (
    <main className="chat">
      <div className="messages">
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
