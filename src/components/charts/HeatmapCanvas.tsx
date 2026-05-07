import { useEffect, useMemo, useRef, useState } from "react";

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
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<null | {
    x: number; y: number;
    bid: number; ask: number; trade: number; count: number;
    priceLo: number; priceHi: number; tStart: number; tEnd: number;
    pressureUp: number; pressureDown: number;
  }>(null);

  // Geometry shared between draw + hover lookup
  const geom = useMemo(() => {
    if (!points.length) return null as any;
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
    type Bin = { bid: number; ask: number; trade: number; total: number; count: number };
    const bins: Bin[][] = Array.from({ length: nT }, () => Array.from({ length: nP }, () => ({ bid: 0, ask: 0, trade: 0, total: 0, count: 0 })));
    for (const p of points) {
      const ti = Math.min(nT - 1, Math.floor((p.time - tMin) / timeBinMs));
      const pi = Math.min(nP - 1, Math.floor((p.price - pMin) / priceBin));
      const b = bins[ti][pi];
      if (p.side === "bid") b.bid += p.weight;
      else if (p.side === "ask") b.ask += p.weight;
      else b.trade += p.weight;
      b.total += p.weight;
      b.count += 1;
    }
    let max = 0;
    for (const col of bins) for (const b of col) if (b.total > max) max = b.total;
    return { tMin, pMin, tSpan, pSpan, padL, padB, padR, padT, W, H, nT, nP, bins, max: max || 1 };
  }, [points, width, height, timeBinMs, priceBin]);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = width * dpr; cv.height = height * dpr;
    const ctx = cv.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "hsl(220 18% 8%)";
    ctx.fillRect(0, 0, width, height);

    if (!points.length || !geom) {
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = "12px JetBrains Mono";
      ctx.fillText("无数据", 12, 20);
      return;
    }

    const { tMin, pMin, tSpan, pSpan, padL, padT, W, H, nT, nP, bins, max } = geom;

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
    if (refPrice != null && refPrice >= pMin && refPrice <= pMin + pSpan) {
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
  }, [geom, width, height, colorMode, refPrice, title, points.length]);

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!geom) return;
    const rect = wrapRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const { padL, padT, W, H, nT, nP, bins, tMin, pMin, tSpan, pSpan } = geom;
    if (x < padL || x > padL + W || y < padT || y > padT + H) { setHover(null); return; }
    const cellW = W / nT, cellH = H / nP;
    const i = Math.min(nT - 1, Math.max(0, Math.floor((x - padL) / cellW)));
    const jFromTop = Math.min(nP - 1, Math.max(0, Math.floor((y - padT) / cellH)));
    const j = nP - 1 - jFromTop; // since drawn flipped
    const b = bins[i][j];
    const priceLo = pMin + j * (pSpan / nP);
    const priceHi = priceLo + pSpan / nP;
    const tStart = tMin + i * (tSpan / nT);
    const tEnd = tStart + tSpan / nT;
    // Pressure: sum of bid below this row, ask above this row across full window
    let pressureUp = 0, pressureDown = 0;
    for (let ii = 0; ii < nT; ii++) {
      for (let jj = 0; jj < nP; jj++) {
        const bb = bins[ii][jj];
        if (jj > j) pressureUp += bb.ask;       // ask sitting above => resistance
        else if (jj < j) pressureDown += bb.bid; // bid sitting below => support
      }
    }
    setHover({ x, y, bid: b.bid, ask: b.ask, trade: b.trade, count: b.count, priceLo, priceHi, tStart, tEnd, pressureUp, pressureDown });
  }

  function fmtTime(ms: number) {
    const d = new Date(ms);
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
  }

  return (
    <div ref={wrapRef} style={{ width: "100%", maxWidth: width, height, position: "relative" }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <canvas ref={ref} style={{ width: "100%", height, display: "block" }} />
      {hover && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-border bg-popover/95 backdrop-blur px-2.5 py-1.5 text-[11px] font-mono shadow-lg"
          style={{
            left: Math.min(hover.x + 12, width - 200),
            top: Math.max(8, hover.y - 96),
            minWidth: 180,
          }}
        >
          <div className="text-muted-foreground">{fmtTime(hover.tStart)} → {fmtTime(hover.tEnd)}</div>
          <div className="text-foreground">价区 ${hover.priceLo.toFixed(2)} – ${hover.priceHi.toFixed(2)}</div>
          <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5">
            {colorMode === "bidask" ? (
              <>
                <span className="text-bull">Bid {hover.bid.toFixed(0)}</span>
                <span className="text-bear">Ask {hover.ask.toFixed(0)}</span>
                <span className="text-muted-foreground col-span-2">报价数 {hover.count}</span>
              </>
            ) : (
              <>
                <span>成交量 {hover.trade.toFixed(0)}</span>
                <span className="text-muted-foreground">笔数 {hover.count}</span>
              </>
            )}
          </div>
          <div className="mt-1 pt-1 border-t border-border/60 grid grid-cols-2 gap-x-3">
            <span className="text-bull">↓支撑 {hover.pressureDown.toFixed(0)}</span>
            <span className="text-bear">↑压力 {hover.pressureUp.toFixed(0)}</span>
          </div>
        </div>
      )}
    </div>
  );
}