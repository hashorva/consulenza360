import type { DashboardSummary, IsinListResponse, RunLogs, Settings } from "../types/api";

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
  dashboard: () => request<DashboardSummary>("/api/dashboard"),
  settings: () => request<Settings>("/api/settings"),
  saveSettings: (body: Partial<Settings>) =>
    request<Settings>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  isins: (params: URLSearchParams) => request<IsinListResponse>(`/api/isins?${params.toString()}`),
  addIsin: (body: { isin: string; bond_name: string }) =>
    request("/api/isins", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteIsin: (isin: string) =>
    request(`/api/isins/${isin}`, {
      method: "DELETE",
    }),
  startRun: () =>
    request<{ run_id: string; total_isins: number }>("/api/runs", {
      method: "POST",
      body: JSON.stringify({}),
    }),
  runLogs: (runId: string) => request<RunLogs>(`/api/runs/${runId}/logs`),
};

