import type { AppEventListResponse, DashboardSummary, Identity, IsinListResponse, RunLogs, Settings, UserSettings } from "../types/api";

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
  startRun: () =>
    request<{ run_id: string; total_isins: number }>("/api/runs", {
      method: "POST",
      body: JSON.stringify({}),
    }),
  runLogs: (runId: string) => request<RunLogs>(`/api/runs/${runId}/logs`),
};
