// Split a string into split-flap display cells — one cell per visible character.
// `Array.from` iterates by Unicode code point, so a glyph like "→" is one cell.
// Spaces are kept as their own cell so route codes ("JFK → CUN") retain their gaps
// on the board.
export function splitFlapCells(text: string): string[] {
  return Array.from(text);
}
