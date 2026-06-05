import { type ReactNode } from "react";

// Minimal, SAFE prose formatter for the assistant's chat (prose-only by design).
// Renders **bold**, *italic*, and `- `/`• ` bullet lists into React nodes — never
// raw HTML (no dangerouslySetInnerHTML), so there is no injection surface. Streaming
// produces partial markers (e.g. a lone "**"); those simply render as text until the
// closing marker streams in.

// Split a single line into bold/italic spans.
function renderInline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  // Tokenize on **bold** first, then *italic* within plain segments.
  const boldParts = text.split(/(\*\*[^*]+\*\*)/g);
  boldParts.forEach((part, bi) => {
    const bm = /^\*\*([^*]+)\*\*$/.exec(part);
    if (bm) { out.push(<strong key={`${keyBase}-b${bi}`}>{bm[1]}</strong>); return; }
    const italicParts = part.split(/(\*[^*]+\*)/g);
    italicParts.forEach((ip, ii) => {
      const im = /^\*([^*]+)\*$/.exec(ip);
      if (im) out.push(<em key={`${keyBase}-b${bi}i${ii}`}>{im[1]}</em>);
      else if (ip) out.push(ip);
    });
  });
  return out;
}

export function Prose({ text }: { text: string }): ReactNode {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let bullets: ReactNode[] = [];

  const flushBullets = () => {
    if (bullets.length) {
      blocks.push(<ul key={`ul-${blocks.length}`} className="prose-ul">{bullets}</ul>);
      bullets = [];
    }
  };

  lines.forEach((line, i) => {
    const bullet = /^\s*[-•]\s+(.*)$/.exec(line);
    if (bullet) {
      bullets.push(<li key={`li-${i}`}>{renderInline(bullet[1], `li-${i}`)}</li>);
      return;
    }
    flushBullets();
    if (line.trim() === "") return; // collapse blank lines (gap handled by CSS)
    blocks.push(<p key={`p-${i}`} className="prose-p">{renderInline(line, `p-${i}`)}</p>);
  });
  flushBullets();

  return <>{blocks}</>;
}
