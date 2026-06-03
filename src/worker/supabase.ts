import { createClient } from "@supabase/supabase-js";
import type { Env, Supabase } from "./types";

export function createSupabase(env: Env): Supabase {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase Worker secrets.");
  }

  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      fetch,
    },
  });
}

