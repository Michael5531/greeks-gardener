// AI 分析 GEX 与期权策略建议
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const POLY = "https://api.polygon.io";
const POLY_KEY = Deno.env.get("POLYGON_API_KEY") ?? "";

async function fetchTrend(ticker: string): Promise<{ bars: { d: string; c: number }[]; chg5: number | null; chg20: number | null; high: number | null; low: number | null }> {
  if (!ticker || !POLY_KEY) return { bars: [], chg5: null, chg20: null, high: null, low: null };
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  try {
    const r = await fetch(`${POLY}/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=120&apiKey=${POLY_KEY}`);
    const d = await r.json();
    const bars = (d.results ?? []).map((b: any) => ({ d: new Date(b.t).toISOString().slice(0, 10), c: b.c }));
    if (!bars.length) return { bars: [], chg5: null, chg20: null, high: null, low: null };
    const last = bars[bars.length - 1].c;
    const ago5 = bars[Math.max(0, bars.length - 6)]?.c ?? last;
    const ago20 = bars[Math.max(0, bars.length - 21)]?.c ?? last;
    const closes = bars.map((b: any) => b.c);
    return {
      bars,
      chg5: ((last - ago5) / ago5) * 100,
      chg20: ((last - ago20) / ago20) * 100,
      high: Math.max(...closes),
      low: Math.min(...closes),
    };
  } catch { return { bars: [], chg5: null, chg20: null, high: null, low: null }; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { ticker, spot, expirations, expiration, totalGEX, zeroGamma, rows } = await req.json();
    const expList: string[] = Array.isArray(expirations) ? expirations : (expiration ? [expiration] : []);

    const fmtM = (v: any) => {
      const n = Number(v);
      return Number.isFinite(n) ? `${(n / 1e6).toFixed(2)}M` : "N/A";
    };
    const fmt2 = (v: any) => {
      const n = Number(v);
      return Number.isFinite(n) ? n.toFixed(2) : "N/A";
    };

    // Top strikes by absolute net GEX
    const top = (rows ?? [])
      .slice()
      .sort((a: any, b: any) => Math.abs(b.net) - Math.abs(a.net))
      .slice(0, 12)
      .map((r: any) => `K=${r.strike}: net=${fmtM(r.net)} (call ${fmtM(r.callGex)}, put ${fmtM(r.putGex)})`)
      .join("\n");

    const trend = await fetchTrend(String(ticker ?? "").toUpperCase());
    const recentBars = trend.bars.slice(-20).map((b) => `${b.d}: ${b.c.toFixed(2)}`).join("\n");

    const sysPrompt = `你是资深期权交易员、Gamma 暴露专家与做市商风控专家。结合标的近期价格走势与 GEX(Gamma Exposure) 结构，输出可执行分析。

回复使用中文 markdown，必须基于给出的 Spot、近 60 日走势、Total Net GEX、Zero Gamma 与各行权价 GEX 数据，禁止编造数字。包含以下章节：

## 1. 标的走势 & GEX 结构
- 引用 Spot 当前价、5/20 日涨跌幅、近期高低点
- 解读 Total Net GEX 正负 (正→做市商多 gamma → 抑波 pin；负→做市商空 gamma → 助涨助跌、波动放大)
- 标出 Call Wall (最大正 GEX 行权价) 与 Put Wall (最大负 GEX 行权价)
- Zero Gamma Level 与 Spot 的相对位置含义

## 2. Gamma Squeeze 风险评估
明确判断当前是否存在 Gamma Squeeze 触发条件：
- 是否处于 Net GEX 负值区且 Spot 正在向上突破密集 Call OI/GEX 墙？
- 是否 Spot 已穿越 Zero Gamma Level？方向？
- 评估短期挤压触发概率：低 / 中 / 高，并说明触发价位与目标位
- 反向风险：是否有 Put-side gamma squeeze (向下加速) 风险

## 3. 短期 (1-2 周) 走势预判
- 大概率震荡区间 (基于 Pin 行权价 ± 标准差)
- 突破方向与触发条件
- 关键支撑/阻力 (来自 GEX 墙)

## 4. 中长期 (1-3 个月) 走势预判
- 结合 20 日趋势与远期到期日 GEX 结构
- 主要风险事件 (财报、宏观)
- 趋势延续 vs 反转的概率判断

## 5. 期权策略建议
列表形式，每个策略：**策略名** | 适用场景 | 具体合约(行权价/到期) | 最大盈亏 | 触发条件
覆盖：Covered Call, Cash-Secured Put, Bull Call Spread, Bear Put Spread, Iron Condor, Iron Butterfly, Straddle, Strangle, Calendar Spread, Diagonal Spread, Ratio Spread, Collar。
基于当前 GEX 结构与 squeeze 风险，标注 ⭐ 推荐 2-3 个并说明理由。

## 6. 风险提示`;

    const userPrompt = `标的: ${ticker}
Spot 当前价: $${fmt2(spot)}
近 5 日涨跌: ${trend.chg5 != null ? trend.chg5.toFixed(2) + "%" : "N/A"}
近 20 日涨跌: ${trend.chg20 != null ? trend.chg20.toFixed(2) + "%" : "N/A"}
近 60 日高/低: ${trend.high != null ? `$${trend.high.toFixed(2)} / $${trend.low!.toFixed(2)}` : "N/A"}
到期日筛选: ${expList.length ? expList.join(", ") : "全部"}
Total Net GEX: ${fmtM(totalGEX)}
Zero Gamma Level: ${Number.isFinite(Number(zeroGamma)) ? `$${Number(zeroGamma).toFixed(2)}` : "N/A"}

按行权价 |Net GEX| 排序的前 12 档：
${top || "(无)"}

近 20 个交易日收盘：
${recentBars || "(无走势数据)"}`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        stream: true,
        messages: [
          { role: "system", content: sysPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!resp.ok) {
      if (resp.status === 429) return new Response(JSON.stringify({ error: "AI 请求过于频繁，请稍后重试" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (resp.status === 402) return new Response(JSON.stringify({ error: "AI 额度不足，请到 Settings 充值" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await resp.text();
      return new Response(JSON.stringify({ error: `AI 网关错误: ${t}` }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(resp.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});