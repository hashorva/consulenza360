import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleApi } from "./api";
import { errorResponse } from "./http";
import type { Env, RunMessage } from "./types";

const mocks = vi.hoisted(() => ({
  createSupabase: vi.fn(),
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

vi.mock("./supabase", () => ({
  createSupabase: mocks.createSupabase,
}));

const dashboardSummary = {
  active_isins: 2,
  latest_run: null,
  refresh_policy: null,
  history: [],
};

const isinList = {
  rows: [
    {
      isin: "XS2317069685",
      bond_name: "Example bond",
      active: true,
      status: "present",
      checked_at: null,
      response_time: null,
      error_message: null,
      source_url: null,
    },
  ],
  total: 1,
};

const runLogs = {
  summary: {
    total: 1,
    pending: 0,
    processing: 0,
    completed: 1,
    failed: 0,
  },
  processingItems: [],
  recentChecks: [],
};

function env(): Env {
  return {
    ASSETS: {} as Fetcher,
    RUN_QUEUE: {} as Queue<RunMessage>,
    CONSULENZA360_SUPABASE_URL: "https://example.supabase.co",
    CONSULENZA360_SUPABASE_SERVICE_ROLE_KEY: "service-role",
    CF_ACCESS_TEAM_DOMAIN: "team.example.com",
    CF_ACCESS_AUD: "access-audience",
    APP_ENV: "production",
  };
}

async function responseFor(path: string, init?: RequestInit) {
  try {
    return await handleApi(new Request(`https://app.example.com${path}`, init), env());
  } catch (error) {
    return errorResponse(error);
  }
}

describe("API guest visibility", () => {
  beforeEach(() => {
    mocks.createSupabase.mockReset();
    mocks.createSupabase.mockReturnValue(mocks.supabase);
    mocks.supabase.from.mockReset();
    mocks.supabase.rpc.mockReset();
    mocks.supabase.rpc.mockImplementation(async (name: string) => {
      if (name === "get_dashboard_summary") return { data: dashboardSummary, error: null };
      if (name === "list_isins") return { data: isinList, error: null };
      if (name === "get_run_logs") return { data: runLogs, error: null };
      return { data: null, error: new Error(`Unexpected RPC: ${name}`) };
    });
  });

  it("reports anonymous visitors without requiring Supabase", async () => {
    const response = await responseFor("/api/me");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ email: null, sub: null, authenticated: false });
    expect(mocks.createSupabase).not.toHaveBeenCalled();
  });

  it("keeps the login handoff behind Access", async () => {
    const response = await responseFor("/api/auth/login?redirect=/logs");
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: "Missing Cloudflare Access assertion." });
    expect(mocks.createSupabase).not.toHaveBeenCalled();
  });

  it("allows public dashboard data", async () => {
    const response = await responseFor("/api/dashboard");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(dashboardSummary);
    expect(mocks.supabase.rpc).toHaveBeenCalledWith("get_dashboard_summary");
  });

  it("allows public active ISIN data", async () => {
    const response = await responseFor("/api/isins?page=1&page_size=80");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(isinList);
    expect(mocks.supabase.rpc).toHaveBeenCalledWith("list_isins", expect.objectContaining({ page_size: 80 }));
  });

  it("allows public run-log snapshots for the dashboard live log", async () => {
    const response = await responseFor("/api/runs/00000000-0000-4000-8000-000000000000/logs");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(runLogs);
    expect(mocks.supabase.rpc).toHaveBeenCalledWith("get_run_logs", {
      target_run_id: "00000000-0000-4000-8000-000000000000",
    });
  });

  it("blocks management and operations APIs without Access", async () => {
    const response = await responseFor("/api/events");
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: "Missing Cloudflare Access assertion." });
    expect(mocks.supabase.rpc).not.toHaveBeenCalled();
  });
});
