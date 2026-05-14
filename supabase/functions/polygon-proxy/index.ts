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

async function polygonFetchJson(target: string, tries = 3): Promise<{ data: any; status: number }> {
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
          // Keep waits short — the function has a CPU/wall budget and long
          // serialized retries cause WORKER_RESOURCE_LIMIT errors. Let the
          // client retry instead of holding the worker.
          if (i === tries - 1) {
            return { data: dd, status: rr.status };
          }
          const waitMs = Math.min(2_500, 700 * Math.pow(2, i)) + Math.floor(Math.random() * 200);
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

function isoToNs(iso: string, endOfDay = false) {
  const [y, m, d] = iso.split("-").map(Number);
  const ms = Date.UTC(y, (m ?? 1) - 1, d ?? 1, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  return String(ms * 1_000_000);
}

function withApiKey(url: string, apiKey: string) {
  const u = new URL(url);
  u.searchParams.set("apiKey", apiKey);
  return u.toString();
}

function yahooSession(meta: any) {
  const explicit = String(meta?.marketState || "").toUpperCase();
  if (explicit) return explicit;
  const now = Math.floor(Date.now() / 1000);
  const p = meta?.currentTradingPeriod ?? {};
  if (now >= p.pre?.start && now < p.pre?.end) return "PRE";
  if (now >= p.regular?.start && now < p.regular?.end) return "REGULAR";
  if (now >= p.post?.start && now < p.post?.end) return "POST";
  return "CLOSED";
}

function yahooBarsFromChart(res0: any) {
  const ts: number[] = res0?.timestamp ?? [];
  const q = res0?.indicators?.quote?.[0] ?? {};
  return ts.map((t: number, i: number) => ({
    t: t * 1000,
    o: q.open?.[i] ?? q.close?.[i] ?? null,
    h: q.high?.[i] ?? q.close?.[i] ?? null,
    l: q.low?.[i] ?? q.close?.[i] ?? null,
    c: q.close?.[i] ?? null,
    v: q.volume?.[i] ?? 0,
  })).filter((b: any) => b.c != null);
}

async function optionQuoteDailyBars(optionTicker: string, from: string, to: string, apiKey: string, ttl: number, maxPages = 24) {
  const byDay = new Map<string, any>();
  let next = `${POLYGON_BASE}/v3/quotes/${encodeURIComponent(optionTicker)}?timestamp.gte=${isoToNs(from)}&timestamp.lte=${isoToNs(to, true)}&order=asc&limit=50000&sort=timestamp`;
  let pages = 0;
  while (next && pages < maxPages) {
    const keyed = next.replace(/([?&])apiKey=[^&]+&?/, "$1");
    const { data, status } = await safeCachedPolygon(`hist-quotes:${keyed}`, ttl, withApiKey(next, apiKey));
    if (status >= 400) break;
    for (const q of data?.results ?? []) {
      const ts = q.sip_timestamp ?? q.participant_timestamp ?? q.trf_timestamp;
      const bid = q.bid_price ?? q.bid;
      const ask = q.ask_price ?? q.ask;
      const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : bid > 0 ? bid : ask > 0 ? ask : null;
      if (!(ts > 0) || !(mid > 0)) continue;
      const day = new Date(ts / 1_000_000).toISOString().slice(0, 10);
      const bar = byDay.get(day) ?? { t: Date.parse(`${day}T16:00:00Z`), o: mid, h: mid, l: mid, c: mid, v: 0, quote_count: 0, source: "quote_mid" };
      bar.h = Math.max(bar.h, mid);
      bar.l = Math.min(bar.l, mid);
      bar.c = mid;
      bar.quote_count += 1;
      byDay.set(day, bar);
    }
    pages++;
    next = data?.next_url ? data.next_url : "";
  }
  return { bars: Array.from(byDay.values()).sort((a, b) => a.t - b.t), pages };
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
        // Use Yahoo Finance (free, no key, supports pre/post market) as the
        // PRIMARY snapshot source — it is more reliable than Polygon's
        // composite (which can miss extended-hours minute bars and rate-limits
        // easily across the watchlist). Polygon /prev is used only as a
        // fallback if Yahoo fails. Returns the shape the frontend expects.
        const sym = String(body.ticker || "").toUpperCase();
        const key = `snap2:${sym}`;
        const cachedR = await cachedFetchJson(key, ttl, async () => {
          // 1) Try Yahoo first.
          let yMeta: any = null;
          let yLast: any = null;
          try {
            const yUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1m&range=1d&includePrePost=true`;
            const yr = await fetch(yUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
            if (yr.ok) {
              const yj = await yr.json();
              const res0 = yj?.chart?.result?.[0] ?? null;
              yMeta = res0?.meta ?? null;
              yLast = yahooBarsFromChart(res0).at(-1) ?? null;
            }
          } catch (_) { /* ignore — fallback below */ }

          // 2) If Yahoo failed, fall back to Polygon /prev (no extended-hours).
          let pPrev: any = null;
          if (!yMeta) {
            try {
              const pr = await polygonFetchJson(
                `${POLYGON_BASE}/v2/aggs/ticker/${encodeURIComponent(sym)}/prev?adjusted=true&apiKey=${apiKey}`,
              );
              pPrev = pr.data?.results?.[0] ?? null;
            } catch (_) { /* ignore */ }
          }
          return { data: { yMeta, yLast, pPrev }, status: 200 };
        });

        const { yMeta, yLast, pPrev } = cachedR.data;
        if (yMeta) {
          const reg = yMeta.regularMarketPrice ?? null;
          const prev = yMeta.chartPreviousClose ?? yMeta.previousClose ?? null;
          const pre = yMeta.preMarketPrice ?? null;
          const post = yMeta.postMarketPrice ?? null;
          const state = yahooSession(yMeta);
          const last = yLast?.c ?? null;
          // Pick the most relevant live price for the current session.
          const live = state === "PRE" ? (pre ?? last ?? reg)
            : (state === "POST" || state === "POSTPOST") ? (post ?? last ?? reg)
            : state === "REGULAR" ? (last ?? reg)
            : (post ?? last ?? reg ?? pre ?? prev);
          return json({
            status: "OK",
            ticker: {
              ticker: sym,
              lastTrade: live != null ? { p: live, t: (yLast?.t ?? Date.now()) * 1e6 } : null,
              day: { c: reg ?? live },
              min: live != null ? { c: live, t: (yLast?.t ?? Date.now()) * 1e6 } : null,
              prevDay: { c: prev },
              preMarket: pre != null ? { p: pre } : null,
              postMarket: post != null ? { p: post } : null,
              marketState: state,
              source: "yahoo-chart",
              todaysChange: live != null && prev != null ? live - prev : null,
              todaysChangePerc: live != null && prev ? ((live - prev) / prev) * 100 : null,
              updated: (yLast?.t ?? Date.now()) * 1e6,
            },
          });
        }

        // Polygon fallback (no extended-hours).
        const prevClose = pPrev?.c ?? null;
        return json({
          status: "OK",
          ticker: {
            ticker: sym,
            lastTrade: prevClose != null ? { p: prevClose, t: Date.now() * 1e6 } : null,
            day: { c: prevClose },
            min: null,
            prevDay: { c: prevClose, o: pPrev?.o, h: pPrev?.h, l: pPrev?.l, v: pPrev?.v },
            todaysChange: 0,
            todaysChangePerc: 0,
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
            const { data: dd } = await polygonFetchJson(next);
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
            const { data: dd } = await polygonFetchJson(next);
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
        const canUseYahoo = (timespan === "day" && multiplier === 1) || (timespan === "minute" && multiplier === 5);
        const fetchYahoo = async () => {
          const interval = timespan === "minute" ? "5m" : "1d";
          const period1 = Math.floor(new Date(from).getTime() / 1000);
          const period2 = Math.floor(new Date(to).getTime() / 1000) + 86400;
          const yUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${period1}&period2=${period2}&interval=${interval}&includePrePost=true`;
          const yKey = `yaggs2:${ticker}|${multiplier}|${timespan}|${from}|${to}`;
          const yr = await cachedFetchJson(yKey, ttl, async () => {
            const rr = await fetch(yUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
            const jj = await rr.json().catch(() => ({}));
            return { data: jj, status: rr.status };
          });
          return yahooBarsFromChart(yr.data?.chart?.result?.[0]);
        };
        const tgt = `${POLYGON_BASE}/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/${multiplier}/${timespan}/${from}/${to}?adjusted=true&sort=asc&limit=5000&apiKey=${apiKey}`;
        const key = `aggs:${ticker}|${multiplier}|${timespan}|${from}|${to}`;
        const r = await cachedFetchJson(key, ttl, () => polygonFetchJson(tgt))
          .catch((e) => ({ data: { error: e instanceof Error ? e.message : String(e) }, status: 503 }));
        let results: any[] = Array.isArray(r.data?.results) ? r.data.results : [];
        // Yahoo fallback for daily/YTD and intraday sparklines when Polygon is empty or partial.
        if ((results.length === 0 || (timespan === "minute" && results.length < 8)) && canUseYahoo) {
          try {
            const yBars = await fetchYahoo();
            if (yBars.length > results.length) results = yBars;
          } catch (_) { /* leave empty */ }
        }
        return json({ status: "OK", results });
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
        let optionBars = optionR.data?.results ?? [];
        const messages = [optionR.data?.message ?? optionR.data?.error, stockR.data?.message ?? stockR.data?.error].filter(Boolean);
        let source = "aggs";
        if (optionBars.length < 30) {
          const quoteDaily = await optionQuoteDailyBars(option_ticker, from, to, apiKey, ttl);
          if (quoteDaily.bars.length > optionBars.length) {
            optionBars = quoteDaily.bars;
            source = "quotes_mid_daily";
            messages.push(`期权聚合日K只有 ${optionR.data?.results?.length ?? 0} 根，已用历史 bid/ask mid 重建为 ${quoteDaily.bars.length} 根日K`);
          }
        }
        return json({
          status: "OK",
          option: optionBars,
          underlying: stockR.data?.results ?? [],
          option_source: source,
          fallback: optionR.status >= 400 || stockR.status >= 400,
          messages,
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
    const r = await cachedFetchJson(target, ttl, () => polygonFetchJson(target)).catch((e) => ({
      data: { error: e instanceof Error ? e.message : String(e) },
      status: 503,
    }));
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