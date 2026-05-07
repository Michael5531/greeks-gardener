import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function fmtK(n: number) {
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(Math.round(n));
}

export function buildExpColors(exps: string[]): Record<string, string> {
  const list = [...exps].sort();
  const map: Record<string, string> = {};
  const N = Math.max(1, list.length);
  list.forEach((e, i) => { map[e] = `hsl(${Math.round((i * 360) / N)} 70% 55%)`; });
  return map;
}

/**
 * Stacked bar chart: positive (call) above zero, negative (put) below zero,
 * one color per expiration. Optional reference vertical line for spot.
 */
export default function DTEStackedChart({
  data,
  xKey,
  exps,
  colors,
  refX,
  valueLabel,
  refLines,
}: {
  data: any[];
  xKey: string;
  exps: string[];
  colors: Record<string, string>;
  refX?: number | null;
  valueLabel?: string;
  refLines?: { x: number; label: string; color?: string }[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 32 }} stackOffset="sign" barCategoryGap="8%">
        <CartesianGrid stroke="hsl(var(--grid-line))" vertical={false} />
        <XAxis
          dataKey={xKey}
          type="category"
          interval="preserveStartEnd"
          minTickGap={8}
          height={36}
          tickMargin={8}
          tick={{ fontSize: 11, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }}
        />
        <YAxis
          tick={{ fontSize: 11, fontFamily: "JetBrains Mono", fill: "hsl(var(--muted-foreground))" }}
          tickFormatter={(v: number) => fmtK(Math.abs(v))}
        />
        <ReferenceLine y={0} stroke="hsl(var(--border))" />
        <Tooltip
          contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontFamily: "JetBrains Mono", fontSize: 12 }}
          formatter={(v: number, name: string) => {
            const isCall = name.endsWith("__c");
            const exp = name.replace(/__[cp]$/, "");
            return [`${isCall ? "C" : "P"} ${fmtK(Math.abs(v))}${valueLabel ? " " + valueLabel : ""}`, exp];
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11, fontFamily: "JetBrains Mono" }} formatter={(v: string) => v.replace(/__[cp]$/, "")} />
        {exps.map(e => (
          <Bar key={`${e}-c`} dataKey={`${e}__c`} stackId="dte" fill={colors[e]} name={`${e}__c`} />
        ))}
        {exps.map(e => (
          <Bar key={`${e}-p`} dataKey={`${e}__p`} stackId="dte" fill={colors[e]} fillOpacity={0.55} name={`${e}__p`} legendType="none" />
        ))}
        {refX != null && (
          <ReferenceLine
            x={refX}
            stroke="hsl(var(--foreground))"
            strokeDasharray="4 4"
            strokeWidth={1.5}
            label={{ value: `Spot ${refX.toFixed(2)}`, position: "top", fill: "hsl(var(--foreground))", fontSize: 11, fontFamily: "JetBrains Mono" }}
          />
        )}
        {(refLines ?? []).map((r, i) => (
          <ReferenceLine
            key={i}
            x={r.x}
            stroke={r.color ?? "hsl(var(--accent))"}
            strokeDasharray="3 3"
            label={{ value: r.label, position: "top", fill: r.color ?? "hsl(var(--accent))", fontSize: 10, fontFamily: "JetBrains Mono" }}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}