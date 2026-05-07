import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Activity, BarChart3, LineChart, TrendingUp, Boxes, Radar } from "lucide-react";

const features = [
  { icon: Activity, title: "3D Greeks 可视化", desc: "Δ × Γ × Θ 三维散点图，实时旋转探索整个期权链结构" },
  { icon: BarChart3, title: "GEX 分析", desc: "Gamma Exposure 分布、Zero Gamma Level、Pin Risk 识别" },
  { icon: LineChart, title: "专业回测", desc: "Covered Call / Spread / Iron Condor 模板，含 Sharpe / 回撤 / 胜率" },
  { icon: Boxes, title: "完整期权链", desc: "Polygon.io 实时数据，Calls / Puts、IV、OI、Volume" },
  { icon: Radar, title: "策略信号", desc: "扫描你的 Watchlist，按规则生成开仓建议" },
  { icon: TrendingUp, title: "美股标的库", desc: "搜索任何美股，加入自选并跟踪 Greeks 与 IV Rank" },
];

export default function Index() {
  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-40 pointer-events-none" />
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(circle at 50% 0%, hsl(165 90% 50% / 0.15), transparent 60%)" }} />

      <header className="relative z-10 max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-md grid place-items-center" style={{ background: "var(--gradient-primary)" }}>
            <TrendingUp className="h-5 w-5 text-background" />
          </div>
          <div className="font-semibold tracking-tight text-lg">OPTIX</div>
        </div>
        <Link to="/auth"><Button variant="outline" size="sm">登录 / 注册</Button></Link>
      </header>

      <section className="relative z-10 max-w-5xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-card/60 text-xs font-mono text-muted-foreground mb-6">
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          POLYGON.IO · LIVE OPTIONS DATA
        </div>
        <h1 className="text-5xl md:text-7xl font-bold tracking-tighter leading-[1.05]">
          <span className="bg-clip-text text-transparent" style={{ backgroundImage: "var(--gradient-primary)" }}>
            美股期权
          </span>
          <br/>策略与回测平台
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
          专业的 3D Greeks 可视化、GEX 市场结构分析、可编程策略回测引擎。
          为系统化期权交易者打造。
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link to="/auth"><Button size="lg" className="glow">开始使用</Button></Link>
          <Link to="/auth"><Button size="lg" variant="outline">查看 Demo</Button></Link>
        </div>
      </section>

      <section className="relative z-10 max-w-6xl mx-auto px-6 pb-24 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {features.map(f => (
          <div key={f.title} className="group p-5 rounded-lg border border-border bg-card/50 backdrop-blur hover:border-primary/40 transition-colors">
            <f.icon className="h-6 w-6 text-primary mb-3" />
            <div className="font-semibold mb-1">{f.title}</div>
            <div className="text-sm text-muted-foreground">{f.desc}</div>
          </div>
        ))}
      </section>

      <footer className="relative z-10 border-t border-border py-6 text-center text-xs text-muted-foreground font-mono">
        OPTIX · 仅信号研究平台，不构成投资建议
      </footer>
    </div>
  );
}
