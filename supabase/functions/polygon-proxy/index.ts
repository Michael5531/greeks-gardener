// Polygon.io REST proxy — injects API key, exposes a small set of endpoints.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const POLYGON_BASE = "https://api.polygon.io";
let polygonChain: Promise<any> = Promise.resolve();
let polygonLastAt = 0;
const POLYGON_MIN_INTERVAL_MS = 350;

// ── In-memory cache + in-flight dedupe to absorb bursts and stay under the
// upstream rate limit. Keyed by the full upstream URL (incl. apiKey).
const TTL_MS: Record<string, number> = {
  "ticker-snapshot": 15_000,
  "options-snapshot-chain": 30_000,
  "options-expirations": 5 * 60_000,
  "options-contracts": 60_000,
  "stock-aggregates": 30_000,
  "option-aggregates": 60_000,
  "market-status": 30_000,
  "option-quotes": 10_000,
  "option-trades": 10_000,
  "option-intraday-pair": 30_000,
  "option-history-pair": 5 * 60_000,
  "option-snapshot-single": 15_000,
  "search-tickers": 60_000,
};
const cache = new Map<string, { at: number; data: any; status: number }>();
const inflight = new Map<string, Promise<{ data: any; status: number }>>();
async function cachedFetchJson(key: string, ttl: number, run: () => Promise<{ data: any; status: number }>) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return { data: hit.data, status: hit.status };
  const pending = inflight.get(key);
  if (pending) return pending;
  const p = (async () => {
    try {
      const r = await run();
      if (r.status < 400) cache.set(key, { at: Date.now(), data: r.data, status: r.status });
      return r;
    } finally { inflight.delete(key); }
  })();
  inflight.set(key, p);
  return p;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function polygonFetchJson(target: string, tries = 6): Promise<{ data: any; status: number }> {
  const run = async () => {
    let last: any = null;
    const since = Date.now() - polygonLastAt;
    if (since < POLYGON_MIN_INTERVAL_MS) await wait(POLYGON_MIN_INTERVAL_MS - since);

    for (let i = 0; i < tries; i++) {
      try {
        const rr = await fetch(target);
        polygonLastAt = Date.now();
        const dd = await rr.json().catch(() => ({}));
        const softRateLimit = dd?.status === "ERROR" && `${dd?.error ?? dd?.message ?? ""}`.toLowerCase().includes("maximum requests per minute");
        if (rr.status === 429 || softRateLimit || (rr.status >= 500 && rr.status < 600)) {
          last = dd;
          const waitMs = Math.min(18_000, 1_200 * Math.pow(2, i)) + Math.floor(Math.random() * 350);
          console.warn(`[polygon-proxy] retry ${i + 1}/${tries} status=${rr.status} wait=${waitMs}ms`);
          await wait(waitMs);
          continue;
        }
        return { data: dd, status: rr.status };
      } catch (e) {
        last = e;
        await wait(Math.min(8_000, 800 * (i + 1)));
      }
    }
    throw new Error(last?.error ?? last?.message ?? "Polygon request failed after retries");
  };
  const p = polygonChain.then(run, run);
  polygonChain = p.catch(() => {});
  return p;
}

async function safeCachedPolygon(key: string, ttl: number, target: string) {
  try {
    return await cachedFetchJson(key, ttl, () => polygonFetchJson(target));
  } catch (e) {
    return { data: { results: [], error: e instanceof Error ? e.message : String(e) }, status: 503 };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const apiKey = Deno.env.get("POLYGON_API_KEY");
  if (!apiKey) {
    return json({ error: "POLYGON_API_KEY not configured" }, 500);
  }

  try {
    let body: any = {};
    if (req.method === "POST") {
      try {
        const text = await req.text();
        body = text ? JSON.parse(text) : {};
      } catch {
        body = {};
      }
    }
    const url = new URL(req.url);
    const action = body.action ?? url.searchParams.get("action");
    const ttl = TTL_MS[action] ?? 10_000;

    let endpoint = "";
    const params = new URLSearchParams();

    switch (action) {
      case "search-tickers": {
        endpoint = "/v3/reference/tickers";
        params.set("search", body.query ?? "");
        params.set("market", "stocks");
        params.set("active", "true");
        params.set("limit", "10");
        break;
      }
      case "ticker-snapshot": {
        // The /v2/snapshot/.../tickers/{T} endpoint requires the Stocks Snapshot
        // entitlement which not all plans include. Compose an equivalent
        // payload from /prev (prevDay close) + the most recent 1-min bar
        // (used as the "last trade" price). Returns the same shape the
        // frontend expects: { ticker: { lastTrade: {p}, day: {c}, prevDay: {c} } }.
        const t = encodeURIComponent(body.ticker);
        const today = new Date();
        const from = new Date(today.getTime() - 5 * 24 * 3600 * 1000)
          .toISOString().slice(0, 10);
        const to = today.toISOString().slice(0, 10);
        const key = `snap:${body.ticker}`;
        const cachedR = await cachedFetchJson(key, ttl, async () => {
          const [prevR, minR] = await Promise.all([
            fetch(`${POLYGON_BASE}/v2/aggs/ticker/${t}/prev?adjusted=true&apiKey=${apiKey}`),
            fetch(`${POLYGON_BASE}/v2/aggs/ticker/${t}/range/1/minute/${from}/${to}?adjusted=true&sort=desc&limit=1&apiKey=${apiKey}`),
          ]);
          const prevJ = await prevR.json().catch(() => ({}));
          const minJ = await minR.json().catch(() => ({}));
          return { data: { prevJ, minJ }, status: 200 };
        });
        const { prevJ, minJ } = cachedR.data;
        const prevClose = prevJ?.results?.[0]?.c ?? null;
        const lastBar = minJ?.results?.[0] ?? null;
        const lastPrice = lastBar?.c ?? prevClose;
        return json({
          status: "OK",
          ticker: {
            ticker: body.ticker,
            lastTrade: lastPrice != null ? { p: lastPrice, t: lastBar?.t ?? Date.now() * 1e6 } : null,
            day: { c: lastPrice, o: lastBar?.o, h: lastBar?.h, l: lastBar?.l, v: lastBar?.v },
            min: lastBar ? { c: lastBar.c, o: lastBar.o, h: lastBar.h, l: lastBar.l, v: lastBar.v, t: lastBar.t } : null,
            prevDay: { c: prevClose, o: prevJ?.results?.[0]?.o, h: prevJ?.results?.[0]?.h, l: prevJ?.results?.[0]?.l, v: prevJ?.results?.[0]?.v },
            todaysChange: lastPrice != null && prevClose != null ? lastPrice - prevClose : null,
            todaysChangePerc: lastPrice != null && prevClose ? ((lastPrice - prevClose) / prevClose) * 100 : null,
            updated: Date.now() * 1e6,
          },
        });
      }
      case "options-contracts": {
        endpoint = "/v3/reference/options/contracts";
        params.set("underlying_ticker", body.ticker);
        if (body.expiration_date) params.set("expiration_date", body.expiration_date);
        params.set("limit", "1000");
        params.set("expired", "false");
        break;
      }
      case "options-snapshot-chain": {
        const key = `chain:${body.ticker}|${body.expiration_date ?? ""}`;
        const r = await cachedFetchJson(key, ttl, async () => {
          const expQ = body.expiration_date ? `&expiration_date=${encodeURIComponent(body.expiration_date)}` : "";
          let next = `${POLYGON_BASE}/v3/snapshot/options/${encodeURIComponent(body.ticker)}?limit=250${expQ}&apiKey=${apiKey}`;
          const all: any[] = [];
          let pages = 0;
          const maxPages = body.expiration_date ? 6 : 20;
          while (next && pages < maxPages) {
            const rr = await fetch(next);
            const dd = await rr.json();
            if (Array.isArray(dd.results)) all.push(...dd.results);
            pages++;
            next = dd.next_url ? `${dd.next_url}&apiKey=${apiKey}` : "";
          }
          return { data: { results: all }, status: 200 };
        });
        return json(r.data, r.status);
      }
      case "options-expirations": {
        const key = `exps:${body.ticker}`;
        const r = await cachedFetchJson(key, ttl, async () => {
          const seen = new Set<string>();
          let next = `${POLYGON_BASE}/v3/reference/options/contracts?underlying_ticker=${encodeURIComponent(body.ticker)}&limit=1000&expired=false&apiKey=${apiKey}`;
          let pages = 0;
          while (next && pages < 10) {
            const rr = await fetch(next);
            const dd = await rr.json();
            for (const c of dd.results ?? []) {
              if (c.expiration_date) seen.add(c.expiration_date);
            }
            pages++;
            next = dd.next_url ? `${dd.next_url}&apiKey=${apiKey}` : "";
          }
          return { data: { results: Array.from(seen).sort() }, status: 200 };
        });
        return json(r.data, r.status);
      }
      case "stock-aggregates": {
        const { ticker, from, to, timespan = "day", multiplier = 1 } = body;
        endpoint = `/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/${multiplier}/${timespan}/${from}/${to}`;
        params.set("adjusted", "true");
        params.set("sort", "asc");
        params.set("limit", "5000");
        break;
      }
      case "option-aggregates": {
        const { option_ticker, from, to } = body;
        endpoint = `/v2/aggs/ticker/${encodeURIComponent(option_ticker)}/range/1/day/${from}/${to}`;
        params.set("adjusted", "true");
        params.set("sort", "asc");
        params.set("limit", "5000");
        break;
      }
      case "option-history-pair": {
        const { option_ticker, underlying, from, to } = body;
        if (!option_ticker || !underlying || !from || !to) return json({ error: "missing option_ticker, underlying, from or to" }, 400);
        const optionTarget = `${POLYGON_BASE}/v2/aggs/ticker/${encodeURIComponent(option_ticker)}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=5000&apiKey=${apiKey}`;
        const stockTarget = `${POLYGON_BASE}/v2/aggs/ticker/${encodeURIComponent(underlying)}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=5000&apiKey=${apiKey}`;
        const [optionR, stockR] = await Promise.all([
          safeCachedPolygon(`hist-opt:${option_ticker}|${from}|${to}`, ttl, optionTarget),
          safeCachedPolygon(`hist-stock:${underlying}|${from}|${to}`, ttl, stockTarget),
        ]);
        return json({
          status: "OK",
          option: optionR.data?.results ?? [],
          underlying: stockR.data?.results ?? [],
          fallback: optionR.status >= 400 || stockR.status >= 400,
          messages: [optionR.data?.message ?? optionR.data?.error, stockR.data?.message ?? stockR.data?.error].filter(Boolean),
        });
      }
      case "market-status": {
        endpoint = "/v1/marketstatus/now";
        break;
      }
      case "option-quotes": {
        const { option_ticker, gte, lte, limit = 50000, order = "asc" } = body;
        endpoint = `/v3/quotes/${encodeURIComponent(option_ticker)}`;
        if (gte) params.set("timestamp.gte", String(gte));
        if (lte) params.set("timestamp.lte", String(lte));
        params.set("order", order);
        params.set("limit", String(limit));
        params.set("sort", "timestamp");
        break;
      }
      case "option-trades": {
        const { option_ticker, gte, limit = 5000 } = body;
        endpoint = `/v3/trades/${encodeURIComponent(option_ticker)}`;
        if (gte) params.set("timestamp.gte", String(gte));
        params.set("order", "desc");
        params.set("limit", String(limit));
        params.set("sort", "timestamp");
        break;
      }
      case "option-intraday-pair": {
        const { option_ticker, underlying, date, gte, lte, limit = 50000 } = body;
        if (!option_ticker || !underlying || !date || !gte || !lte) return json({ error: "missing option_ticker, underlying, date, gte or lte" }, 400);
        const quoteTarget = `${POLYGON_BASE}/v3/quotes/${encodeURIComponent(option_ticker)}?timestamp.gte=${gte}&timestamp.lte=${lte}&order=asc&limit=${limit}&sort=timestamp&apiKey=${apiKey}`;
        const minuteTarget = `${POLYGON_BASE}/v2/aggs/ticker/${encodeURIComponent(underlying)}/range/1/minute/${date}/${date}?adjusted=true&sort=asc&limit=50000&apiKey=${apiKey}`;
        const [quoteR, minuteR] = await Promise.all([
          safeCachedPolygon(`quotes:${option_ticker}|${gte}|${lte}|${limit}`, ttl, quoteTarget),
          safeCachedPolygon(`minute:${underlying}|${date}`, ttl, minuteTarget),
        ]);
        return json({
          status: "OK",
          quotes: quoteR.data?.results ?? [],
          underlying_minutes: minuteR.data?.results ?? [],
          fallback: quoteR.status >= 400 || minuteR.status >= 400,
          messages: [quoteR.data?.message ?? quoteR.data?.error, minuteR.data?.message ?? minuteR.data?.error].filter(Boolean),
        });
      }
      case "option-snapshot-single": {
        const { underlying, option_ticker } = body;
        endpoint = `/v3/snapshot/options/${encodeURIComponent(underlying)}/${encodeURIComponent(option_ticker)}`;
        break;
      }
      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }

    params.set("apiKey", apiKey);
    const target = `${POLYGON_BASE}${endpoint}?${params.toString()}`;
    const r = await cachedFetchJson(target, ttl, () => polygonFetchJson(target));
    if (r.status >= 400) return json(fallbackPayload(action, r.data, r.status), 200);
    return json(r.data, r.status);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function fallbackPayload(action: string, data: any, status: number) {
  const message = data?.message ?? data?.error ?? `Upstream returned ${status}`;
  if (action === "market-status") return { status: "OK", fallback: true, upstream_status: status, message };
  return { status: "OK", results: [], fallback: true, upstream_status: status, message };
}