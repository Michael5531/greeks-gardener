import { useEffect, useRef, useState } from "react";

/**
 * Container that measures its bounding box via ResizeObserver and passes
 * concrete pixel width/height to its child render-prop. Use instead of
 * recharts <ResponsiveContainer/>, which sometimes returns -1/-1 on mobile
 * and renders charts with zero size.
 */
export default function ChartSizer({
  children,
  className,
}: {
  children: (size: { width: number; height: number }) => React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 320, height: 240 });

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => {
      const rect = node.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      setSize(prev => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    window.addEventListener("resize", update);
    return () => { observer.disconnect(); window.removeEventListener("resize", update); };
  }, []);

  return <div ref={ref} className={className ?? "h-full w-full min-h-0 min-w-0"}>{children(size)}</div>;
}
