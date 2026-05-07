export function parseExpFromContract(symbol: string): string | null {
  // OCC: O:AAPL230616C00150000 -> 2023-06-16
  const m = symbol.match(/^O:[A-Z.]+(\d{2})(\d{2})(\d{2})[CP]/);
  if (!m) return null;
  return `20${m[1]}-${m[2]}-${m[3]}`;
}

export function fmt(n: number | null | undefined, d = 2) {
  if (n == null || isNaN(n as number)) return "—";
  return (n as number).toFixed(d);
}

export function fmtPct(n: number | null | undefined, d = 2) {
  if (n == null || isNaN(n as number)) return "—";
  return `${((n as number) * 100).toFixed(d)}%`;
}