// Historical option flow: fetch most active contracts in window, then for each
// contract fetch trades + quotes, classify large prints (with bid/ask context)
// and detect simple sweeps.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const POLYGON_BASE = "https://api.polygon.io";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const apiKey = Deno.env.get("POLYGON_API_KEY");
  if (!apiKey) return json({ error: "POLYGON_API_KEY not configured" }, 500);
  try {
    const body = await req.json();
    const ticker: string = (body.ticker ?? "").toUpperCase();
    const fromDate: string = body.from_date;
    const toDate: string = body.to_date;
    const maxContracts: number = Math.min(50, body.max_contracts ?? 12);
    const limitPerContract: number = Math.min(5000, body.limit_per_contract ?? 1500);
    const top: number = body.top ?? 10;
    const minSize: number = body.min_size ?? 500;
    const minPremium: number = body.min_premium ?? 100_000;
    const sweepWindowMs: number = body.sweep_window_ms ?? 500;
    const sweepMinLegs: number = body.sweep_min_legs ?? 3;

    if (!ticker || !fromDate || !toDate) return json({ error: "ticker/from_date/to_date required" }, 400);

    // 1. select active contracts via snapshot (proxy for "most active")
    const snapUrl = `${POLYGON_BASE}/v3/snapshot/options/${encodeURIComponent(ticker)}?limit=250&apiKey=${apiKey}`;
    const snapRes = await fetch(snapUrl);
    const snapData = await snapRes.json();
    const all: any[] = Array.isArray(snapData.results) ? snapData.results : [];
    // current underlying spot (Polygon embeds it on each contract snapshot)
    const underlyingPrice: number | null =
      all.find((c: any) => c?.underlying_asset?.price != null)?.underlying_asset?.price ?? null;
    const ranked = all
      .map((c: any) => ({ c, score: (c.day?.volume ?? 0) + (c.open_interest ?? 0) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, maxContracts)
      .map(x => x.c);

    const fromMs = Date.parse(fromDate + "T00:00:00Z");
    const toMs = Date.parse(toDate + "T23:59:59Z");
    const fromNs = fromMs * 1_000_000;
    const toNs = toMs * 1_000_000;

    type Print = {
      time: number; ticker: string; underlying: string; strike: number; type: "call" | "put"; expiration: string;
      price: number; size: number; premium: number; context: "at bid" | "at ask" | "mid" | "no quote" | "above ask" | "below bid";
      exchange: number;
    };
    const allPrints: Print[] = [];
    const contractStats: { ticker: string; volume: number; premium: number }[] = [];
    const sweeps: { ticker: string; start: number; end: number; legs: number; totalSize: number; totalPremium: number; price: number; side: "buy" | "sell" | "mixed" }[] = [];

    for (const c of ranked) {
      const ot: string = c.details?.ticker ?? "";
      if (!ot) continue;
      const strike = c.details?.strike_price ?? 0;
      const ctype = c.details?.contract_type === "put" ? "put" : "call";
      const exp = c.details?.expiration_date ?? "";

      // fetch trades
      const trUrl = `${POLYGON_BASE}/v3/trades/${encodeURIComponent(ot)}?timestamp.gte=${fromNs}&timestamp.lte=${toNs}&order=asc&limit=${limitPerContract}&sort=timestamp&apiKey=${apiKey}`;
      const trRes = await fetch(trUrl); const trData = await trRes.json();
      const trades: any[] = Array.isArray(trData.results) ? trData.results : [];

      // fetch quotes (limited window per contract)
      const qUrl = `${POLYGON_BASE}/v3/quotes/${encodeURIComponent(ot)}?timestamp.gte=${fromNs}&timestamp.lte=${toNs}&order=asc&limit=${limitPerContract}&sort=timestamp&apiKey=${apiKey}`;
      const qRes = await fetch(qUrl); const qData = await qRes.json();
      const quotes: any[] = Array.isArray(qData.results) ? qData.results : [];

      let totalVol = 0; let totalPrem = 0;
      let qIdx = 0;
      for (const tr of trades) {
        const ts = tr.sip_timestamp ?? tr.participant_timestamp ?? 0;
        const price = tr.price ?? 0;
        const size = tr.size ?? 0;
        const premium = price * size * 100;
        totalVol += size; totalPrem += premium;

        // walk quotes to find latest <= ts
        while (qIdx + 1 < quotes.length && (quotes[qIdx + 1].sip_timestamp ?? 0) <= ts) qIdx++;
        const q = quotes[qIdx];
        let context: Print["context"] = "no quote";
        if (q && q.bid_price && q.ask_price) {
          const mid = (q.bid_price + q.ask_price) / 2;
          const tol = Math.max(0.01, (q.ask_price - q.bid_price) * 0.1);
          if (price >= q.ask_price - tol && price <= q.ask_price + tol) context = "at ask";
          else if (price >= q.bid_price - tol && price <= q.bid_price + tol) context = "at bid";
          else if (price > q.ask_price) context = "above ask";
          else if (price < q.bid_price) context = "below bid";
          else context = "mid";
          // suppress unused mid var warning
          void mid;
        }

        if (size >= minSize || premium >= minPremium) {
          allPrints.push({
            time: ts / 1_000_000, ticker: ot, underlying: ticker, strike, type: ctype, expiration: exp,
            price, size, premium, context, exchange: tr.exchange ?? 0,
          });
        }
      }
      contractStats.push({ ticker: ot, volume: totalVol, premium: totalPrem });

      // sweep detection: same price ± tol within window across exchanges
      let i = 0;
      while (i < trades.length) {
        const t0 = trades[i];
        const ts0 = (t0.sip_timestamp ?? 0) / 1_000_000;
        const price0 = t0.price;
        const exchanges = new Set<number>([t0.exchange ?? -1]);
        let legs = 1; let size = t0.size ?? 0; let prem = (t0.size ?? 0) * (t0.price ?? 0) * 100;
        let j = i + 1;
        while (j < trades.length) {
          const tj = trades[j];
          const tsj = (tj.sip_timestamp ?? 0) / 1_000_000;
          if (tsj - ts0 > sweepWindowMs) break;
          if (Math.abs((tj.price ?? 0) - price0) <= 0.01) {
            legs++; exchanges.add(tj.exchange ?? -1);
            size += tj.size ?? 0; prem += (tj.size ?? 0) * (tj.price ?? 0) * 100;
          }
          j++;
        }
        if (legs >= sweepMinLegs && exchanges.size >= 2) {
          sweeps.push({
            ticker: ot, start: ts0, end: (trades[j - 1].sip_timestamp ?? 0) / 1_000_000, legs,
            totalSize: size, totalPremium: prem, price: price0, side: "mixed",
          });
          i = j;
        } else { i++; }
      }
    }

    allPrints.sort((a, b) => b.premium - a.premium);
    contractStats.sort((a, b) => b.premium - a.premium);
    return json({
      ticker, from_date: fromDate, to_date: toDate, scanned: ranked.length,
      underlying_price: underlyingPrice,
      contracts: contractStats.slice(0, top),
      large_prints: allPrints.slice(0, 200),
      sweeps: sweeps.slice(0, 100),
      total_prints: allPrints.length,
      total_sweeps: sweeps.length,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}