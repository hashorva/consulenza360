export type CheckStatus = "present" | "absent" | "error" | "unchecked";
export type RunStatus = "pending" | "processing" | "completed" | "failed" | "blocked";

export type CheckRun = {
  id: string;
  status: RunStatus;
  trigger_type: "cron" | "manual";
  scheduled_date: string;
  timezone: string;
  started_at: string;
  completed_at: string | null;
  total_isins: number;
  processed_isins: number;
  present_count: number;
  absent_count: number;
  error_count: number;
  blocked_reason: string | null;
};

export type DashboardSummary = {
  active_isins: number;
  latest_run: CheckRun | null;
  history: Array<{
    scheduled_date: string;
    present_count: number;
    absent_count: number;
    error_count: number;
  }>;
};

export type IsinRow = {
  isin: string;
  bond_name: string;
  active: boolean;
  deleted_at?: string | null;
  deleted_by?: string | null;
  status: CheckStatus | null;
  checked_at: string | null;
  response_time: number | null;
  error_message: string | null;
  source_url: string | null;
};

export type IsinListResponse = {
  rows: IsinRow[];
  total: number;
};

export type Settings = {
  id: boolean;
  enabled: boolean;
  timezone: string;
  run_hour: number;
  weekday_only: boolean;
  updated_at: string;
};

export type UserSettings = {
  identity_email: string;
  theme_preference: "light" | "dark" | "device";
  timezone: string;
  dashboard_refresh_seconds: number;
  chart_display: string;
  updated_at: string;
};

export type AppEvent = {
  id: string;
  source: "user" | "worker";
  level: "info" | "success" | "warning" | "error";
  message: string;
  entity_type: string | null;
  entity_id: string | null;
  actor_email: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type AppEventListResponse = {
  rows: AppEvent[];
  total: number;
};

export type Identity = {
  authenticated: boolean;
  email: string | null;
  sub: string | null;
};

export type RunLogs = {
  summary: {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    errored: number;
  };
  recentChecks: Array<{
    isin: string;
    bond_name: string;
    status: "present" | "absent" | "error";
    response_time: number | null;
    error_message: string | null;
    checked_at: string;
  }>;
  processingItems: Array<{
    isin: string;
    bond_name: string;
    claimed_at: string | null;
  }>;
};
