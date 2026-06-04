import { requireAccess, type AccessIdentity } from "./access";
import { ApiError, jsonResponse, readJson } from "./http";
import { startManualRun } from "./runner";
import { createSupabase } from "./supabase";
import type { Env } from "./types";

const ISIN_PATTERN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

type AddIsinBody = {
  isin?: string;
  bond_name?: string;
};

type UpdateIsinBody = {
  bond_name?: string;
};

type SettingsBody = {
  enabled?: boolean;
  run_hour?: number;
  weekday_only?: boolean;
  manual_refresh_cooldown_minutes?: number;
  manual_refresh_daily_limit?: number;
};

type UserSettingsBody = {
  theme_preference?: "light" | "dark" | "device";
  timezone?: string;
  dashboard_refresh_seconds?: number;
  chart_display?: string;
};

type EventBody = {
  source?: "user" | "worker";
  level?: "info" | "success" | "warning" | "error";
  message?: string;
  entity_type?: string;
  entity_id?: string;
  metadata?: Record<string, unknown>;
};

type ImportIsinBody = {
  rows?: Array<{
    isin?: string;
    bond_name?: string;
  }>;
};

function identityEmail(identity: AccessIdentity) {
  return identity.email ?? identity.sub ?? "unknown";
}

function validateIsin(value: unknown) {
  const isin = String(value ?? "").trim().toUpperCase();
  if (!ISIN_PATTERN.test(isin)) {
    throw new ApiError(400, "ISIN must be a valid 12-character code.");
  }
  return isin;
}

function validateBondName(value: unknown) {
  const bondName = String(value ?? "").trim();
  if (!bondName) {
    throw new ApiError(400, "Bond name is required.");
  }
  return bondName;
}

async function recordEvent(
  supabase: ReturnType<typeof createSupabase>,
  identity: AccessIdentity,
  event: Required<Pick<EventBody, "source" | "level" | "message">> & Omit<EventBody, "source" | "level" | "message">,
) {
  await supabase.rpc("record_app_event", {
    event_source: event.source,
    event_level: event.level,
    event_message: event.message,
    event_entity_type: event.entity_type ?? null,
    event_entity_id: event.entity_id ?? null,
    event_actor_email: identityEmail(identity),
    event_metadata: event.metadata ?? {},
  });
}

export async function handleApi(request: Request, env: Env): Promise<Response> {
  const identity = await requireAccess(request, env);

  const url = new URL(request.url);
  const supabase = createSupabase(env);

  if (url.pathname === "/api/health") {
    return jsonResponse({ ok: true });
  }

  if (url.pathname === "/api/me" && request.method === "GET") {
    return jsonResponse({ email: identity.email ?? null, sub: identity.sub ?? null, authenticated: true });
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
    const isin = validateIsin(body.isin);
    const bondName = validateBondName(body.bond_name);

    const { data, error } = await supabase
      .from("isins")
      .upsert(
        {
          isin,
          bond_name: bondName,
          active: true,
          deleted_at: null,
          deleted_by: null,
          restored_at: new Date().toISOString(),
          restored_by: identityEmail(identity),
        },
        { onConflict: "isin" },
      )
      .select()
      .single();
    if (error) throw error;
    await recordEvent(supabase, identity, {
      source: "user",
      level: "success",
      message: `ISIN ${isin} added`,
      entity_type: "isin",
      entity_id: isin,
    });
    return jsonResponse(data, { status: 201 });
  }

  if (url.pathname === "/api/isins/import" && request.method === "POST") {
    const body = await readJson<ImportIsinBody>(request);
    const rows = body.rows ?? [];
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new ApiError(400, "Import rows are required.");
    }
    if (rows.length > 1_000) {
      throw new ApiError(400, "Import is limited to 1000 rows at a time.");
    }

    const seen = new Set<string>();
    const validRows = rows.map((row) => {
      const isin = validateIsin(row.isin);
      const bondName = validateBondName(row.bond_name);
      if (seen.has(isin)) throw new ApiError(400, `Duplicate ISIN in import: ${isin}`);
      seen.add(isin);
      return {
        isin,
        bond_name: bondName,
        active: true,
        deleted_at: null,
        deleted_by: null,
        restored_at: new Date().toISOString(),
        restored_by: identityEmail(identity),
      };
    });

    const { data, error } = await supabase.from("isins").upsert(validRows, { onConflict: "isin" }).select();
    if (error) throw error;
    await recordEvent(supabase, identity, {
      source: "user",
      level: "success",
      message: `${validRows.length} ISINs imported`,
      entity_type: "isin_import",
      metadata: { count: validRows.length },
    });
    return jsonResponse({ rows: data, imported: validRows.length }, { status: 201 });
  }

  if (url.pathname === "/api/isins/deleted" && request.method === "GET") {
    const { data, error } = await supabase.rpc("list_deleted_isins", {
      search_query: url.searchParams.get("q") ?? "",
      page_size: Math.min(Math.max(Number(url.searchParams.get("page_size") ?? "80"), 1), 100),
      page_offset: 0,
    });
    if (error) throw error;
    return jsonResponse(data);
  }

  const isinDeleteMatch = url.pathname.match(/^\/api\/isins\/([A-Za-z0-9]{12})$/);
  if (isinDeleteMatch && request.method === "PUT") {
    const isin = validateIsin(isinDeleteMatch[1]);
    const body = await readJson<UpdateIsinBody>(request);
    const bondName = validateBondName(body.bond_name);
    const { data, error } = await supabase
      .from("isins")
      .update({ bond_name: bondName })
      .eq("isin", isin)
      .select()
      .single();
    if (error) throw error;
    await recordEvent(supabase, identity, {
      source: "user",
      level: "success",
      message: `ISIN ${isin} edited`,
      entity_type: "isin",
      entity_id: isin,
    });
    return jsonResponse(data);
  }

  if (isinDeleteMatch && request.method === "DELETE") {
    const isin = isinDeleteMatch[1]?.toUpperCase();
    const { error } = await supabase
      .from("isins")
      .update({ active: false, deleted_at: new Date().toISOString(), deleted_by: identityEmail(identity) })
      .eq("isin", isin);
    if (error) throw error;
    await recordEvent(supabase, identity, {
      source: "user",
      level: "warning",
      message: `ISIN ${isin} deleted`,
      entity_type: "isin",
      entity_id: isin,
    });
    return jsonResponse({ ok: true });
  }

  const isinRestoreMatch = url.pathname.match(/^\/api\/isins\/([A-Za-z0-9]{12})\/restore$/);
  if (isinRestoreMatch && request.method === "POST") {
    const isin = validateIsin(isinRestoreMatch[1]);
    const { data, error } = await supabase
      .from("isins")
      .update({
        active: true,
        deleted_at: null,
        deleted_by: null,
        restored_at: new Date().toISOString(),
        restored_by: identityEmail(identity),
      })
      .eq("isin", isin)
      .select()
      .single();
    if (error) throw error;
    await recordEvent(supabase, identity, {
      source: "user",
      level: "success",
      message: `ISIN ${isin} restored`,
      entity_type: "isin",
      entity_id: isin,
    });
    return jsonResponse(data);
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
    if (
      typeof body.manual_refresh_cooldown_minutes === "number"
      && Number.isInteger(body.manual_refresh_cooldown_minutes)
      && body.manual_refresh_cooldown_minutes >= 15
      && body.manual_refresh_cooldown_minutes <= 240
    ) {
      patch.manual_refresh_cooldown_minutes = body.manual_refresh_cooldown_minutes;
    }
    if (
      typeof body.manual_refresh_daily_limit === "number"
      && Number.isInteger(body.manual_refresh_daily_limit)
      && body.manual_refresh_daily_limit >= 1
      && body.manual_refresh_daily_limit <= 8
    ) {
      patch.manual_refresh_daily_limit = body.manual_refresh_daily_limit;
    }

    const { data, error } = await supabase.from("settings").update(patch).eq("id", true).select().single();
    if (error) throw error;
    return jsonResponse(data);
  }

  if (url.pathname === "/api/user-settings" && request.method === "GET") {
    const email = identityEmail(identity);
    const { data, error } = await supabase
      .from("user_settings")
      .upsert({ identity_email: email }, { onConflict: "identity_email" })
      .select()
      .single();
    if (error) throw error;
    return jsonResponse(data);
  }

  if (url.pathname === "/api/user-settings" && request.method === "PUT") {
    const email = identityEmail(identity);
    const body = await readJson<UserSettingsBody>(request);
    const patch: UserSettingsBody & { identity_email: string } = { identity_email: email };
    if (body.theme_preference && ["light", "dark", "device"].includes(body.theme_preference)) {
      patch.theme_preference = body.theme_preference;
    }
    if (typeof body.timezone === "string" && body.timezone.trim()) patch.timezone = body.timezone.trim();
    if (
      typeof body.dashboard_refresh_seconds === "number"
      && Number.isInteger(body.dashboard_refresh_seconds)
      && body.dashboard_refresh_seconds >= 4
      && body.dashboard_refresh_seconds <= 300
    ) {
      patch.dashboard_refresh_seconds = body.dashboard_refresh_seconds;
    }
    if (typeof body.chart_display === "string" && body.chart_display.trim()) patch.chart_display = body.chart_display.trim();

    const { data, error } = await supabase
      .from("user_settings")
      .upsert(patch, { onConflict: "identity_email" })
      .select()
      .single();
    if (error) throw error;
    await recordEvent(supabase, identity, {
      source: "user",
      level: "success",
      message: "User settings updated",
      entity_type: "user_settings",
      entity_id: email,
    });
    return jsonResponse(data);
  }

  if (url.pathname === "/api/events" && request.method === "GET") {
    const { data, error } = await supabase.rpc("list_app_events", {
      source_filter: url.searchParams.get("source") ?? "all",
      page_size: Math.min(Math.max(Number(url.searchParams.get("page_size") ?? "80"), 1), 100),
      page_offset: 0,
    });
    if (error) throw error;
    return jsonResponse(data);
  }

  if (url.pathname === "/api/events" && request.method === "POST") {
    const body = await readJson<EventBody>(request);
    if (!body.message?.trim()) throw new ApiError(400, "Event message is required.");
    await recordEvent(supabase, identity, {
      source: body.source ?? "user",
      level: body.level ?? "info",
      message: body.message.trim(),
      entity_type: body.entity_type,
      entity_id: body.entity_id,
      metadata: body.metadata,
    });
    return jsonResponse({ ok: true }, { status: 201 });
  }

  if (url.pathname === "/api/runs" && request.method === "POST") {
    const run = await startManualRun(env);
    if (!run.allowed) {
      return jsonResponse(run, { status: 429 });
    }

    await recordEvent(supabase, identity, {
      source: "user",
      level: "success",
      message: "Manual run started",
      entity_type: "check_run",
      entity_id: run.run_id ?? undefined,
      metadata: {
        total_isins: run.total_isins,
        remaining_today: run.remaining_today,
        next_allowed_at: run.next_allowed_at,
      },
    });
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
