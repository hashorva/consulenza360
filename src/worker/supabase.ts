import { createClient } from "@supabase/supabase-js";
import type { Env, Supabase } from "./types";

export function createSupabase(env: Env): Supabase {
  if (!env.CONSULENZA360_SUPABASE_URL || !env.CONSULENZA360_SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing Consulenza360 Supabase Worker secrets.");
  }

  return createClient(env.CONSULENZA360_SUPABASE_URL, env.CONSULENZA360_SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      fetch,
    },
  });
}
