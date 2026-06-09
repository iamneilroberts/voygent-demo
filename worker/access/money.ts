export function usdToMicros(usd: number): number {
  return Math.round(usd * 1_000_000);
}
export function microsToUsd(micros: number): number {
  return micros / 1_000_000;
}
export function formatUsd(micros: number): string {
  return `$${(micros / 1_000_000).toFixed(2)}`;
}
