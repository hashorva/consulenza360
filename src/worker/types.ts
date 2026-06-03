import type { SupabaseClient } from "@supabase/supabase-js";

export type CheckStatus = "present" | "absent" | "error";
export type RunStatus = "pending" | "processing" | "completed" | "failed" | "blocked";

export type Env = {
  ASSETS: Fetcher;
  RUN_QUEUE: Queue<RunMessage>;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  BORSA_ENDPOINT_BASE?: string;
  APP_ENV?: string;
};

export type RunMessage = {
  run_id: string;
  iteration: number;
};

export type ClaimedIsin = {
  isin: string;
  bond_name: string;
};

export type CheckResult = {
  isin: string;
  status: CheckStatus;
  parsed_fields: Record<string, unknown>;
  source_url: string;
  response_time: number;
  error_message?: string | null;
  checked_at: string;
};

export type BlockedResult = {
  kind: "blocked";
  isin: string;
  reason: string;
  source_url: string;
  response_time: number;
  status_code?: number;
};

export type Supabase = SupabaseClient;

