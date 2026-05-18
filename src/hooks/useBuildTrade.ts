import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BuiltLeg {
  type: "call" | "put";
  side: "long" | "short";
  strike: number;
  expiration: string;
  iv: number;
  mid: number;
  delta: number;
  theta: number;
}
export interface BuiltStructure {
  name: string;
  legs: BuiltLeg[];
  cost: number;
  maxProfit: number | null;
  maxLoss: number | null;
  breakevens: number[];
  pop: number | null;
  ev: number | null;
  profitAtTarget: number;
  theta: number;
  iv30: number | null;
  expiration: string;
  rationale: string;
}
export interface BuildTradeResult {
  ticker: string;
  spot: number;
  direction: "long" | "short" | "neutral";
  target: number;
  days: number;
  expiration: string;
  dte: number;
  iv30: number | null;
  structures: BuiltStructure[];
  computed_at: string;
  fallback?: boolean;
  warning?: string | null;
}

function friendlyEdgeError(message: string) {
  if (message.includes("non-2xx") || message.includes("FunctionsHttpError")) {
    return "策略生成服务暂时不可用；请重试一次，系统会使用理论定价模式兜底。";
  }
  return message;
}

export function useBuildTrade() {
  return useMutation({
    mutationFn: async (input: {
      ticker: string;
      direction: "long" | "short" | "neutral";
      target: number;
      days: number;
      budget?: number | null;
    }) => {
      const { data, error } = await supabase.functions.invoke("build-trade", { body: input });
      if (error) throw new Error(friendlyEdgeError(error.message ?? "Build failed"));
      if ((data as any)?.error) throw new Error(friendlyEdgeError((data as any).error));
      return data as BuildTradeResult;
    },
  });
}