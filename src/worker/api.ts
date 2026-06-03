import { requireAccess } from "./access";
import { ApiError, jsonResponse, readJson } from "./http";
import { startManualRun } from "./runner";
import { createSupabase } from "./supabase";
import type { Env } from "./types";

const ISIN_PATTERN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

type AddIsinBody = {
  isin?: string;
  bond_name?: string;
};

type SettingsBody = {
  enabled?: boolean;
  run_hour?: number;
  weekday_only?: boolean;
};

export async function handleApi(request: Request, env: Env): Promise<Response> {
  await requireAccess(request, env);

  const url = new URL(request.url);
  const supabase = createSupabase(env);

  if (url.pathname === "/api/health") {
    return jsonResponse({ ok: true });
  }

  if (url.pathname === "/api/dashboard" && request.method === "GET") {
    const { data, error } = await supabase.rpc("get_dashboard_summary");
    if (error) throw error;
    return jsonResponse(data);
  }

  if (url.pathname === "/api/isins" && request.method === "GET") {
    const page = Math.max(Number(url.searchParams.get("page") ?? "1"), 1);
    const pageSize = Math.min(Math.max(Number(url.searchParams.get("page_size") ?? "50"), 1), 100);
    const { data, error } = await supabase.rpc("list_isins", {
      search_query: url.searchParams.get("q") ?? "",
      status_filter: url.searchParams.get("status") ?? "all",
      sort_key: url.searchParams.get("sort") ?? "isin",
      sort_dir: url.searchParams.get("dir") ?? "asc",
      page_size: pageSize,
      page_offset: (page - 1) * pageSize,
    });
    if (error) throw error;
    return jsonResponse(data);
  }

  if (url.pathname === "/api/isins" && request.method === "POST") {
    const body = await readJson<AddIsinBody>(request);
    const isin = String(body.isin ?? "").trim().toUpperCase();
    const bondName = String(body.bond_name ?? "").trim();
    if (!ISIN_PATTERN.test(isin)) {
      throw new ApiError(400, "ISIN must be a valid 12-character code.");
    }
    if (!bondName) {
      throw new ApiError(400, "Bond name is required.");
    }

    const { data, error } = await supabase
      .from("isins")
      .upsert({ isin, bond_name: bondName, active: true }, { onConflict: "isin" })
      .select()
      .single();
    if (error) throw error;
    return jsonResponse(data, { status: 201 });
  }

  const isinDeleteMatch = url.pathname.match(/^\/api\/isins\/([A-Za-z0-9]{12})$/);
  if (isinDeleteMatch && request.method === "DELETE") {
    const isin = isinDeleteMatch[1]?.toUpperCase();
    const { error } = await supabase.from("isins").update({ active: false }).eq("isin", isin);
    if (error) throw error;
    return jsonResponse({ ok: true });
  }

  if (url.pathname === "/api/settings" && request.method === "GET") {
    const { data, error } = await supabase.from("settings").select("*").eq("id", true).single();
    if (error) throw error;
    return jsonResponse(data);
  }

  if (url.pathname === "/api/settings" && request.method === "PUT") {
    const body = await readJson<SettingsBody>(request);
    const patch: SettingsBody = {};
    if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
    if (typeof body.weekday_only === "boolean") patch.weekday_only = body.weekday_only;
    if (typeof body.run_hour === "number" && Number.isInteger(body.run_hour) && body.run_hour >= 0 && body.run_hour <= 23) {
      patch.run_hour = body.run_hour;
    }

    const { data, error } = await supabase.from("settings").update(patch).eq("id", true).select().single();
    if (error) throw error;
    return jsonResponse(data);
  }

  if (url.pathname === "/api/runs" && request.method === "POST") {
    const run = await startManualRun(env);
    return jsonResponse(run, { status: 202 });
  }

  const logMatch = url.pathname.match(/^\/api\/runs\/([0-9a-f-]{36})\/logs$/i);
  if (logMatch && request.method === "GET") {
    const { data, error } = await supabase.rpc("get_run_logs", {
      target_run_id: logMatch[1],
    });
    if (error) throw error;
    return jsonResponse(data);
  }

  throw new ApiError(404, "API route not found.");
}

