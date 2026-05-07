// Black-Scholes pricer + greeks for browser use.
function erf(x: number) {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}
export const N = (x: number) => 0.5 * (1 + erf(x / Math.SQRT2));
const phi = (x: number) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

export type OptType = "call" | "put";

export function bsPrice(S: number, K: number, T: number, r: number, sigma: number, type: OptType): number {
  if (T <= 0 || sigma <= 0) return Math.max(0, type === "call" ? S - K : K - S);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  if (type === "call") return S * N(d1) - K * Math.exp(-r * T) * N(d2);
  return K * Math.exp(-r * T) * N(-d2) - S * N(-d1);
}

export function bsGreeks(S: number, K: number, T: number, r: number, sigma: number, type: OptType) {
  if (T <= 0 || sigma <= 0) return { delta: 0, gamma: 0, theta: 0, vega: 0 };
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  const delta = type === "call" ? N(d1) : N(d1) - 1;
  const gamma = phi(d1) / (S * sigma * Math.sqrt(T));
  const vega = S * phi(d1) * Math.sqrt(T) / 100; // per 1% vol
  const theta = (-S * phi(d1) * sigma / (2 * Math.sqrt(T))
    - (type === "call" ? 1 : -1) * r * K * Math.exp(-r * T) * N((type === "call" ? 1 : -1) * d2)) / 365;
  return { delta, gamma, theta, vega };
}