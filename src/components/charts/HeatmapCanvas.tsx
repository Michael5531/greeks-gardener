import { useEffect, useRef } from "react";

export type HeatPoint = { time: number; price: number; weight: number; side?: "bid" | "ask" | "trade" };

/**
 * Bins points into a 2-D histogram (time × price) and renders a heatmap on canvas.
 * Color intensity = weight (size). For bid/ask it tints differently.
 */
export default function HeatmapCanvas({
  points,
  width = 900,
  height = 360,
  timeBinMs = 5000,
  priceBin = 0.05,
  colorMode = "single",
  refPrice,
  title,
}: {
  points: HeatPoint[];
  width?: number;
  height?: number;
  timeBinMs?: number;
  priceBin?: number;
  colorMode?: "single" | "bidask";
  refPrice?: number | null;
  title?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = width * dpr; cv.height = height * dpr;
    const ctx = cv.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "hsl(220 18% 8%)";
    ctx.fillRect(0, 0, width, height);

    if (!points.length) {
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = "12px JetBrains Mono";
      ctx.fillText("无数据", 12, 20);
      return;
    }

    const tMin = Math.min(...points.map(p => p.time));
    const tMax = Math.max(...points.map(p => p.time));
    const pMin = Math.min(...points.map(p => p.price));
    const pMax = Math.max(...points.map(p => p.price));
    const tSpan = Math.max(timeBinMs, tMax - tMin);
    const pSpan = Math.max(priceBin, pMax - pMin);
    const padL = 50, padB = 24, padR = 8, padT = 18;
    const W = width - padL - padR;
    const H = height - padT - padB;

    const nT = Math.max(1, Math.ceil(tSpan / timeBinMs));
    const nP = Math.max(1, Math.ceil(pSpan / priceBin));
    type Bin = { bid: number; ask: number; trade: number; total: number };
    const bins: Bin[][] = Array.from({ length: nT }, () => Array.from({ length: nP }, () => ({ bid: 0, ask: 0, trade: 0, total: 0 })));
    for (const p of points) {
      const ti = Math.min(nT - 1, Math.floor((p.time - tMin) / timeBinMs));
      const pi = Math.min(nP - 1, Math.floor((p.price - pMin) / priceBin));
      const b = bins[ti][pi];
      if (p.side === "bid") b.bid += p.weight;
      else if (p.side === "ask") b.ask += p.weight;
      else b.trade += p.weight;
      b.total += p.weight;
    }
    let max = 0;
    for (const col of bins) for (const b of col) if (b.total > max) max = b.total;
    if (!max) max = 1;

    const cellW = W / nT;
    const cellH = H / nP;
    for (let i = 0; i < nT; i++) {
      for (let j = 0; j < nP; j++) {
        const b = bins[i][j];
        if (!b.total) continue;
        const intensity = Math.min(1, Math.log10(1 + 9 * (b.total / max)));
        let hue = 200; // primary cyan-ish
        if (colorMode === "bidask") {
          if (b.bid > b.ask) hue = 145; // green-ish bid
          else if (b.ask > b.bid) hue = 5; // red-ish ask
          else hue = 50;
        }
        const alpha = 0.15 + intensity * 0.85;
        ctx.fillStyle = `hsla(${hue}, 80%, 55%, ${alpha})`;
        const x = padL + i * cellW;
        const y = padT + (H - (j + 1) * cellH);
        ctx.fillRect(x, y, Math.max(1, cellW), Math.max(1, cellH));
      }
    }

    // ref price line
    if (refPrice != null && refPrice >= pMin && refPrice <= pMax) {
      const y = padT + (H - ((refPrice - pMin) / pSpan) * H);
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + W, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "10px JetBrains Mono";
      ctx.fillText(`${refPrice.toFixed(2)}`, padL + W - 38, y - 3);
    }

    // axes
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "10px JetBrains Mono";
    // y ticks (price)
    const yTicks = 5;
    for (let k = 0; k <= yTicks; k++) {
      const v = pMin + (pSpan * k) / yTicks;
      const y = padT + H - (k / yTicks) * H;
      ctx.fillText(v.toFixed(2), 4, y + 3);
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + W, y); ctx.stroke();
    }
    // x ticks (time)
    const xTicks = 6;
    for (let k = 0; k <= xTicks; k++) {
      const t = tMin + (tSpan * k) / xTicks;
      const x = padL + (k / xTicks) * W;
      const d = new Date(t);
      const lbl = `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
      ctx.fillText(lbl, x - 18, height - 6);
    }

    if (title) {
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "11px JetBrains Mono";
      ctx.fillText(title, padL, 12);
    }
  }, [points, width, height, timeBinMs, priceBin, colorMode, refPrice, title]);

  return <canvas ref={ref} style={{ width, height }} />;
}