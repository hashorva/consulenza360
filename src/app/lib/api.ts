import type { AppEventListResponse, DashboardSummary, Identity, IsinListResponse, ManualRunDecision, RunLogs, Settings, UserSettings } from "../types/api";

async function request<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

export const api = {
  me: () => request<Identity>("/api/me"),
  dashboard: () => request<DashboardSummary>("/api/dashboard"),
  settings: () => request<Settings>("/api/settings"),
  saveSettings: (body: Partial<Settings>) =>
    request<Settings>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  isins: (params: URLSearchParams) => request<IsinListResponse>(`/api/isins?${params.toString()}`),
  deletedIsins: (params: URLSearchParams) => request<IsinListResponse>(`/api/isins/deleted?${params.toString()}`),
  addIsin: (body: { isin: string; bond_name: string }) =>
    request("/api/isins", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateIsin: (isin: string, body: { bond_name: string }) =>
    request(`/api/isins/${isin}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  importIsins: (rows: Array<{ isin: string; bond_name: string }>) =>
    request<{ imported: number; rows: unknown[] }>("/api/isins/import", {
      method: "POST",
      body: JSON.stringify({ rows }),
    }),
  deleteIsin: (isin: string) =>
    request(`/api/isins/${isin}`, {
      method: "DELETE",
    }),
  restoreIsin: (isin: string) =>
    request(`/api/isins/${isin}/restore`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  userSettings: () => request<UserSettings>("/api/user-settings"),
  saveUserSettings: (body: Partial<UserSettings>) =>
    request<UserSettings>("/api/user-settings", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  events: (params: URLSearchParams) => request<AppEventListResponse>(`/api/events?${params.toString()}`),
  addEvent: (body: { source?: "user" | "worker"; level?: "info" | "success" | "warning" | "error"; message: string; entity_type?: string; entity_id?: string; metadata?: Record<string, unknown> }) =>
    request("/api/events", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  startRun: async () => {
    const response = await fetch("/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const body = (await response.json().catch(() => null)) as ManualRunDecision | { error?: string } | null;

    if (response.status === 429 && body && "allowed" in body) {
      return body;
    }
    if (!response.ok) {
      throw new Error(body && "error" in body && body.error ? body.error : `Request failed with ${response.status}`);
    }
    if (!body || !("allowed" in body)) {
      throw new Error("Manual run response was invalid.");
    }
    return body;
  },
  runLogs: (runId: string) => request<RunLogs>(`/api/runs/${runId}/logs`),
};
