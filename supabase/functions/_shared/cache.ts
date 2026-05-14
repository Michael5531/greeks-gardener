import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function admin() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

export async function getCached(kind: string, key: string): Promise<any | null> {
  const sb = admin();
  const { data } = await sb.from("compute_cache")
    .select("payload, computed_at, fresh_until")
    .eq("kind", kind).eq("cache_key", key).maybeSingle();
  if (!data) return null;
  if (new Date(data.fresh_until).getTime() < Date.now()) return null;
  return { payload: data.payload, computed_at: data.computed_at, source: "cache" as const };
}

export async function setCached(_kind: string, _key: string, _payload: any, _ttlSec: number) {
  // Disabled: no longer persisting compute results to the database.
  return;
}

/** Default TTLs (seconds) — gex/iv-surface/flow refresh fast intraday. */
export function defaultTtl(kind: string): number {
  switch (kind) {
    case "gex":
    case "iv-surface":
    case "flow-agg":
      return 60;
    case "signals":
      return 300;
    case "payoff":
    case "pricer":
      return 3600;
    default:
      return 60;
  }
}