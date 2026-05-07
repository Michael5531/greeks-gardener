// AI 分析 GEX 与期权策略建议
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { ticker, spot, expiration, totalGEX, zeroGamma, rows } = await req.json();

    const fmtM = (v: any) => {
      const n = Number(v);
      return Number.isFinite(n) ? `${(n / 1e6).toFixed(2)}M` : "N/A";
    };

    // Top strikes by absolute net GEX
    const top = (rows ?? [])
      .slice()
      .sort((a: any, b: any) => Math.abs(b.net) - Math.abs(a.net))
      .slice(0, 12)
      .map((r: any) => `K=${r.strike}: net=${fmtM(r.net)} (call ${fmtM(r.callGex)}, put ${fmtM(r.putGex)})`)
      .join("\n");

    const sysPrompt = `你是资深期权交易员与做市商风控专家。基于 GEX(Gamma Exposure) 数据进行分析，并给出可执行的期权策略建议。

回复使用中文 markdown,包含以下章节：
## 1. 市场结构解读
- 解读 Total Net GEX 正负含义(正→低波动pin,负→高波动追涨杀跌)
- 关键 Pin 行权价 (call wall / put wall)
- Zero Gamma Level 的意义与与 Spot 的关系

## 2. 短期价格预期
- 价格大概率震荡区间 / 突破方向
- 风险事件

## 3. 期权策略建议 (覆盖所有主流组合)
对每个策略写: **策略名** | 适用场景 | 具体合约(行权价/到期) | 最大盈亏 | 何时使用
至少包含: Covered Call, Cash-Secured Put, Bull Call Spread, Bear Put Spread, Iron Condor, Iron Butterfly, Straddle, Strangle, Calendar Spread, Diagonal Spread, Ratio Spread, Collar
根据当前 GEX 结构标注 ⭐ 推荐的 2-3 个策略并解释原因。

## 4. 风险提示`;

    const userPrompt = `标的: ${ticker}
Spot: $${spot}
到期日筛选: ${expiration ?? "全部"}
Total Net GEX: ${fmtM(totalGEX)}
Zero Gamma Level: ${Number.isFinite(Number(zeroGamma)) ? `$${Number(zeroGamma).toFixed(2)}` : "N/A"}

按行权价 |Net GEX| 排序的前 12 档：
${top}`;

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