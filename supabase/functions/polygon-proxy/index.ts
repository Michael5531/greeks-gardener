// Polygon.io REST proxy — injects API key, exposes a small set of endpoints.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const POLYGON_BASE = "https://api.massive.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const apiKey = Deno.env.get("POLYGON_API_KEY");
  if (!apiKey) {
    return json({ error: "POLYGON_API_KEY not configured" }, 500);
  }

  try {
    const body = req.method === "POST" ? await req.json() : {};
    const url = new URL(req.url);
    const action = body.action ?? url.searchParams.get("action");

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
        endpoint = `/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(body.ticker)}`;
        break;
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
        endpoint = `/v3/snapshot/options/${encodeURIComponent(body.ticker)}`;
        if (body.expiration_date) params.set("expiration_date", body.expiration_date);
        params.set("limit", "250");
        break;
      }
      case "options-expirations": {
        // Paginate through contracts to get every expiration date
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
        return json({ results: Array.from(seen).sort() });
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
      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }

    params.set("apiKey", apiKey);
    const target = `${POLYGON_BASE}${endpoint}?${params.toString()}`;
    const r = await fetch(target);
    const data = await r.json();
    return json(data, r.status);
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