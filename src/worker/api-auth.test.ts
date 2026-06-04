import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleApi } from "./api";
import { errorResponse } from "./http";
import type { Env, RunMessage } from "./types";

const mocks = vi.hoisted(() => {
  const completeChain = {
    select: vi.fn(),
  };
  const updateChain = {
    eq: vi.fn(() => completeChain),
  };
  return {
    createSupabase: vi.fn(),
    completeChain,
    updateChain,
    supabase: {
      rpc: vi.fn(),
      from: vi.fn(() => ({
        update: vi.fn(() => updateChain),
      })),
    },
  };
});

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

const encoder = new TextEncoder();
const keyPair = await crypto.subtle.generateKey(
  {
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  },
  true,
  ["sign", "verify"],
);
const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);

function base64Url(value: Uint8Array) {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function accessJwt(payload: Record<string, unknown>) {
  const header = base64Url(encoder.encode(JSON.stringify({ alg: "RS256", kid: "test-key" })));
  const body = base64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keyPair.privateKey,
    encoder.encode(`${header}.${body}`),
  );
  return `${header}.${body}.${base64Url(new Uint8Array(signature))}`;
}

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
    mocks.completeChain.select.mockReset();
    mocks.completeChain.select.mockResolvedValue({ error: null });
    mocks.updateChain.eq.mockClear();
    mocks.supabase.from.mockReset();
    mocks.supabase.from.mockReturnValue({
      update: vi.fn(() => mocks.updateChain),
    });
    mocks.supabase.rpc.mockReset();
    mocks.supabase.rpc.mockImplementation(async (name: string) => {
      if (name === "get_dashboard_summary") return { data: dashboardSummary, error: null };
      if (name === "list_isins") return { data: isinList, error: null };
      if (name === "get_run_logs") return { data: runLogs, error: null };
      if (name === "record_app_event") return { data: null, error: null };
      return { data: null, error: new Error(`Unexpected RPC: ${name}`) };
    });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "https://team.example.com/cdn-cgi/access/certs") {
        return Response.json({ keys: [{ ...publicJwk, kid: "test-key" }] });
      }
      return new Response(null, { status: 404 });
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports anonymous visitors without requiring Supabase", async () => {
    const response = await responseFor("/api/me");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ email: null, sub: null, authenticated: false });
    expect(mocks.createSupabase).not.toHaveBeenCalled();
  });

  it("reports authenticated visitors from the Access cookie on public routes", async () => {
    const token = await accessJwt({
      aud: "access-audience",
      exp: Math.floor(Date.now() / 1000) + 300,
      email: "user@example.com",
      sub: "user-subject",
    });

    const response = await responseFor("/api/me", {
      headers: { cookie: `CF_Authorization=${token}` },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ email: "user@example.com", sub: "user-subject", authenticated: true });
    expect(mocks.createSupabase).not.toHaveBeenCalled();
  });

  it("allows protected actions with a valid Access cookie", async () => {
    const token = await accessJwt({
      aud: "access-audience",
      exp: Math.floor(Date.now() / 1000) + 300,
      email: "user@example.com",
      sub: "user-subject",
    });

    const response = await responseFor("/api/isins/XS2317069685", {
      method: "DELETE",
      headers: { cookie: `CF_Authorization=${token}` },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.supabase.rpc).toHaveBeenCalledWith("record_app_event", expect.objectContaining({
      event_actor_email: "user@example.com",
      event_entity_id: "XS2317069685",
    }));
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
