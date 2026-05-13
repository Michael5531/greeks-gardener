import { corsHeaders, json } from "../_shared/cors.ts";
import { getOptionsChain } from "../_shared/polygon.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Multi-strategy signal scanner. Scans the user's watchlist using their JWT,
 * fetches each ticker's option chain, evaluates 7 strategies, inserts signals.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } }, auth: { persistSession: false } },
    );
    const { data: u } = await sb.auth.getUser();
    const user = u?.user;
    if (!user) return json({ error: "unauthorized" }, 401);

    const { data: wl } = await sb.from("watchlist").select("ticker");
    if (!wl?.length) return json({ inserted: 0, count: 0 });

    const dteOf = (exp: string) => Math.round((new Date(exp).getTime() - Date.now()) / 86400000);
    const inserts: any[] = [];
    for (const w of wl) {
      try {
        const chain = await getOptionsChain(w.ticker);
        const valid = chain.filter((c: any) => c.greeks?.delta != null && c.details?.expiration_date);
        if (!valid.length) continue;
        const calls = valid.filter((c: any) => c.details.contract_type === "call");
        const puts = valid.filter((c: any) => c.details.contract_type === "put");
        const pick = (arr: any[], targetDelta: number, dteMin: number, dteMax: number) => {
          const pool = arr.filter((c: any) => {
            const d = dteOf(c.details.expiration_date);
            return d >= dteMin && d <= dteMax;
          });
          if (!pool.length) return null;
          return pool.reduce((b: any, c: any) => {
            const s = Math.abs(Math.abs(c.greeks.delta) - targetDelta);
            return s < b.s ? { s, c } : b;
          }, { s: 1, c: null as any }).c;
        };
        const toSig = (c: any) => ({
          contract: c.details.ticker,
          strike: c.details.strike_price,
          expiration: c.details.expiration_date,
          delta: c.greeks.delta,
          iv: c.implied_volatility,
          bid: c.last_quote?.bid,
          ask: c.last_quote?.ask,
          volume: c.day?.volume ?? 0,
          oi: c.open_interest ?? 0,
        });

        const cc = pick(calls, 0.30, 20, 45);
        if (cc) inserts.push({ user_id: user.id, ticker: w.ticker, strategy_type: "covered_call", signal: { type: "sell_call", ...toSig(cc), note: "卖出 30Δ Call 收权利金" } });
        const csp = pick(puts, 0.30, 20, 45);
        if (csp) inserts.push({ user_id: user.id, ticker: w.ticker, strategy_type: "cash_secured_put", signal: { type: "sell_put", ...toSig(csp), note: "卖出 30Δ Put 等待入场" } });
        const lc = pick(calls, 0.55, 30, 60);
        if (lc) inserts.push({ user_id: user.id, ticker: w.ticker, strategy_type: "long_call", signal: { type: "buy_call", ...toSig(lc), note: "看涨方向性买入" } });
        const lp = pick(puts, 0.30, 30, 60);
        if (lp) inserts.push({ user_id: user.id, ticker: w.ticker, strategy_type: "long_put", signal: { type: "buy_put", ...toSig(lp), note: "下行保护 / 做空" } });

        const longLeg = pick(calls, 0.50, 25, 55);
        if (longLeg) {
          const expCalls = calls.filter((c: any) => c.details.expiration_date === longLeg.details.expiration_date && c.details.strike_price > longLeg.details.strike_price);
          const shortLeg = expCalls.reduce((b: any, c: any) => {
            const s = Math.abs(Math.abs(c.greeks.delta) - 0.25);
            return s < b.s ? { s, c } : b;
          }, { s: 1, c: null as any }).c;
          if (shortLeg) inserts.push({
            user_id: user.id, ticker: w.ticker, strategy_type: "bull_call_spread",
            signal: {
              type: "debit_spread",
              contract: `${longLeg.details.strike_price}/${shortLeg.details.strike_price} Call`,
              strike: longLeg.details.strike_price, expiration: longLeg.details.expiration_date,
              delta: longLeg.greeks.delta - shortLeg.greeks.delta, iv: longLeg.implied_volatility,
              bid: (longLeg.last_quote?.bid ?? 0) - (shortLeg.last_quote?.ask ?? 0),
              ask: (longLeg.last_quote?.ask ?? 0) - (shortLeg.last_quote?.bid ?? 0),
              volume: Math.min(longLeg.day?.volume ?? 0, shortLeg.day?.volume ?? 0),
              oi: Math.min(longLeg.open_interest ?? 0, shortLeg.open_interest ?? 0),
              note: `买 ${longLeg.details.strike_price}C / 卖 ${shortLeg.details.strike_price}C`,
            },
          });
        }
        const longPut = pick(puts, 0.50, 25, 55);
        if (longPut) {
          const expPuts = puts.filter((c: any) => c.details.expiration_date === longPut.details.expiration_date && c.details.strike_price < longPut.details.strike_price);
          const shortPut = expPuts.reduce((b: any, c: any) => {
            const s = Math.abs(Math.abs(c.greeks.delta) - 0.25);
            return s < b.s ? { s, c } : b;
          }, { s: 1, c: null as any }).c;
          if (shortPut) inserts.push({
            user_id: user.id, ticker: w.ticker, strategy_type: "bear_put_spread",
            signal: {
              type: "debit_spread",
              contract: `${longPut.details.strike_price}/${shortPut.details.strike_price} Put`,
              strike: longPut.details.strike_price, expiration: longPut.details.expiration_date,
              delta: longPut.greeks.delta - shortPut.greeks.delta, iv: longPut.implied_volatility,
              bid: (longPut.last_quote?.bid ?? 0) - (shortPut.last_quote?.ask ?? 0),
              ask: (longPut.last_quote?.ask ?? 0) - (shortPut.last_quote?.bid ?? 0),
              volume: Math.min(longPut.day?.volume ?? 0, shortPut.day?.volume ?? 0),
              oi: Math.min(longPut.open_interest ?? 0, shortPut.open_interest ?? 0),
              note: `买 ${longPut.details.strike_price}P / 卖 ${shortPut.details.strike_price}P`,
            },
          });
        }
        const shortC = pick(calls, 0.20, 25, 55);
        const shortP = pick(puts, 0.20, 25, 55);
        if (shortC && shortP && shortC.details.expiration_date === shortP.details.expiration_date) {
          inserts.push({
            user_id: user.id, ticker: w.ticker, strategy_type: "iron_condor",
            signal: {
              type: "credit_condor",
              contract: `${shortP.details.strike_price}P / ${shortC.details.strike_price}C`,
              strike: (shortP.details.strike_price + shortC.details.strike_price) / 2,
              expiration: shortC.details.expiration_date,
              delta: shortC.greeks.delta + shortP.greeks.delta,
              iv: (shortC.implied_volatility + shortP.implied_volatility) / 2,
              bid: (shortP.last_quote?.bid ?? 0) + (shortC.last_quote?.bid ?? 0),
              ask: (shortP.last_quote?.ask ?? 0) + (shortC.last_quote?.ask ?? 0),
              volume: Math.min(shortC.day?.volume ?? 0, shortP.day?.volume ?? 0),
              oi: Math.min(shortC.open_interest ?? 0, shortP.open_interest ?? 0),
              note: "中性区间 · 卖双边收权利金",
            },
          });
        }
      } catch (e) { console.warn("scan", w.ticker, e); }
    }
    if (inserts.length) {
      for (let i = 0; i < inserts.length; i += 50) {
        await sb.from("signals").insert(inserts.slice(i, i + 50));
      }
    }
    return json({ inserted: inserts.length, count: wl.length });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});