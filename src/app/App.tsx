import { useEffect, useMemo, useState } from "react";
import { CancelCircleIcon, Home01Icon, SearchIcon, Settings01Icon } from "@hugeicons/core-free-icons";
import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getCoreRowModel, type SortingState, useReactTable } from "@tanstack/react-table";
import { api } from "./lib/api";
import { cn, formatDateTime } from "./lib/utils";
import type { DashboardSummary, IsinListResponse, IsinRow, Settings } from "./types/api";
import { Icon } from "./components/Icon";
import { RunExecutionLog } from "./components/RunExecutionLog";
import { StatusBadge } from "./components/StatusBadge";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Switch } from "./components/ui/switch";

const STATUS_COLORS = {
  present: "#06b6d4",
  absent: "#a8a29e",
  error: "#f43f5e",
};

function MetricCard({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0 text-xs text-stone-500 dark:text-stone-400">{detail}</CardContent>
    </Card>
  );
}

function DashboardCharts({ summary }: { summary: DashboardSummary | null }) {
  const history = summary?.history ?? [];
  const latest = summary?.latest_run;
  const pieData = latest
    ? [
        { name: "Present", value: latest.present_count, key: "present" },
        { name: "Absent", value: latest.absent_count, key: "absent" },
        { name: "Errors", value: latest.error_count, key: "error" },
      ]
    : [];

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <Card>
        <CardHeader>
          <CardTitle>Historical Presence</CardTitle>
          <CardDescription>Daily EuroTLX snapshots by result state</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history} margin={{ left: 0, right: 6, top: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="presentFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="scheduled_date" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} width={34} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    borderColor: "#e7e5e4",
                    background: "#fff",
                  }}
                />
                <Area type="monotone" dataKey="present_count" stroke="#06b6d4" fill="url(#presentFill)" strokeWidth={2} />
                <Area type="monotone" dataKey="absent_count" stroke="#a8a29e" fill="transparent" strokeWidth={1.5} />
                <Area type="monotone" dataKey="error_count" stroke="#f43f5e" fill="transparent" strokeWidth={1.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Latest Split</CardTitle>
          <CardDescription>Most recent run status mix</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} innerRadius={64} outerRadius={88} paddingAngle={3} dataKey="value">
                  {pieData.map((entry) => (
                    <Cell key={entry.key} fill={STATUS_COLORS[entry.key as keyof typeof STATUS_COLORS]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-md bg-cyan-50 p-2 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300">Present</div>
            <div className="rounded-md bg-stone-100 p-2 text-stone-600 dark:bg-stone-900 dark:text-stone-300">Absent</div>
            <div className="rounded-md bg-rose-50 p-2 text-rose-700 dark:bg-rose-950 dark:text-rose-300">Error</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function IsinList({
  data,
  query,
  status,
  sorting,
  onQuery,
  onStatus,
  onSorting,
  onDelete,
}: {
  data: IsinListResponse | null;
  query: string;
  status: string;
  sorting: SortingState;
  onQuery: (value: string) => void;
  onStatus: (value: string) => void;
  onSorting: (value: SortingState) => void;
  onDelete: (isin: string) => void;
}) {
  const table = useReactTable<IsinRow>({
    data: data?.rows ?? [],
    columns: [],
    state: { sorting },
    onSortingChange: (updaterOrValue) => {
      onSorting(typeof updaterOrValue === "function" ? updaterOrValue(sorting) : updaterOrValue);
    },
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
  });

  const rows = table.getRowModel().rows.map((row) => row.original);

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>ISIN Universe</CardTitle>
            <CardDescription>{data?.total ?? 0} active instruments</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant={status === "all" ? "default" : "secondary"} size="sm" onClick={() => onStatus("all")}>
              All
            </Button>
            <Button variant={status === "present" ? "default" : "secondary"} size="sm" onClick={() => onStatus("present")}>
              Present
            </Button>
            <Button variant={status === "absent" ? "default" : "secondary"} size="sm" onClick={() => onStatus("absent")}>
              Absent
            </Button>
            <Button variant={status === "error" ? "default" : "secondary"} size="sm" onClick={() => onStatus("error")}>
              Error
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-2 md:flex-row">
          <div className="relative flex-1">
            <Icon icon={SearchIcon} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={16} />
            <Input className="pl-9" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search ISIN or bond name..." />
          </div>
          <select
            className="h-9 rounded-md border border-stone-200 bg-white px-3 text-sm dark:border-stone-800 dark:bg-stone-950"
            value={`${sorting[0]?.id ?? "isin"}:${sorting[0]?.desc ? "desc" : "asc"}`}
            onChange={(event) => {
              const [id, dir] = event.target.value.split(":");
              onSorting([{ id, desc: dir === "desc" }]);
            }}
          >
            <option value="isin:asc">ISIN A-Z</option>
            <option value="isin:desc">ISIN Z-A</option>
            <option value="bond_name:asc">Name A-Z</option>
            <option value="status:asc">Status</option>
            <option value="checked_at:desc">Last checked</option>
          </select>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((row) => (
          <article
            key={row.isin}
            className="flex min-h-12 w-full items-center gap-3 rounded-lg border border-stone-100 bg-stone-50 px-3 py-2 dark:border-stone-900 dark:bg-stone-900/60"
          >
            <div className="flex h-9 w-28 shrink-0 items-center justify-center rounded-md border border-stone-200 bg-white font-mono text-xs font-semibold dark:border-stone-800 dark:bg-stone-950">
              {row.isin}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{row.bond_name}</div>
              <div className="truncate text-xs text-stone-500 dark:text-stone-400">Checked {formatDateTime(row.checked_at)}</div>
            </div>
            <StatusBadge status={row.status ?? "unchecked"} />
            <div className="hidden w-20 text-right text-xs text-stone-500 md:block">{row.response_time ? `${row.response_time}ms` : ""}</div>
            {row.source_url ? (
              <Button asChild variant="secondary" size="sm">
                <a href={row.source_url} target="_blank" rel="noreferrer">
                  Source
                </a>
              </Button>
            ) : null}
            <Button variant="ghost" size="icon" onClick={() => onDelete(row.isin)} aria-label={`Delete ${row.isin}`}>
              <Icon icon={CancelCircleIcon} size={16} />
            </Button>
          </article>
        ))}
        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-stone-200 p-8 text-center text-sm text-stone-500 dark:border-stone-800">
            No ISINs match the current filters.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SettingsPanel({
  settings,
  onSave,
  onManualRun,
}: {
  settings: Settings | null;
  onSave: (settings: Partial<Settings>) => void;
  onManualRun: () => void;
}) {
  const [runHour, setRunHour] = useState(settings?.run_hour ?? 10);

  useEffect(() => {
    if (settings) setRunHour(settings.run_hour);
  }, [settings]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Settings</CardTitle>
        <CardDescription>Automation runs on whole-hour Europe/Rome weekdays.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-center justify-between gap-4 rounded-lg border border-stone-200 p-3 dark:border-stone-800">
          <span>
            <span className="block text-sm font-medium">Automation</span>
            <span className="text-xs text-stone-500">Queue-driven daily scan</span>
          </span>
          <Switch checked={settings?.enabled ?? false} onCheckedChange={(enabled) => onSave({ enabled })} />
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-medium">Run hour</span>
          <div className="flex gap-2">
            <Input type="number" min={0} max={23} value={runHour} onChange={(event) => setRunHour(Number(event.target.value))} />
            <Button onClick={() => onSave({ run_hour: runHour })}>Save</Button>
          </div>
        </label>
        <label className="flex items-center justify-between gap-4 rounded-lg border border-stone-200 p-3 dark:border-stone-800">
          <span>
            <span className="block text-sm font-medium">Weekdays only</span>
            <span className="text-xs text-stone-500">Monday to Friday</span>
          </span>
          <Switch checked={settings?.weekday_only ?? true} onCheckedChange={(weekday_only) => onSave({ weekday_only })} />
        </label>
        <Button className="w-full" onClick={onManualRun}>
          Start manual run
        </Button>
      </CardContent>
    </Card>
  );
}

export function App() {
  const [view, setView] = useState<"dashboard" | "settings">("dashboard");
  const [dark, setDark] = useState(false);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [isins, setIsins] = useState<IsinListResponse | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [sorting, setSorting] = useState<SortingState>([{ id: "isin", desc: false }]);
  const [addIsin, setAddIsin] = useState("");
  const [addName, setAddName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const latestRun = summary?.latest_run;
  const runActive = latestRun?.status === "processing";

  const loadDashboard = async () => {
    try {
      const [dashboardData, settingsData] = await Promise.all([api.dashboard(), api.settings()]);
      setSummary(dashboardData);
      setSettings(settingsData);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load dashboard.");
    }
  };

  const loadIsins = async () => {
    try {
      const params = new URLSearchParams({
        q: query,
        status,
        sort: sorting[0]?.id ?? "isin",
        dir: sorting[0]?.desc ? "desc" : "asc",
        page: "1",
        page_size: "80",
      });
      setIsins(await api.isins(params));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load ISIN list.");
    }
  };

  useEffect(() => {
    void loadDashboard();
  }, []);

  useEffect(() => {
    void loadIsins();
  }, [query, status, sorting]);

  useEffect(() => {
    if (!runActive) return;
    const interval = window.setInterval(loadDashboard, 6000);
    return () => window.clearInterval(interval);
  }, [runActive]);

  const addInstrument = async () => {
    await api.addIsin({ isin: addIsin, bond_name: addName });
    setAddIsin("");
    setAddName("");
    await loadIsins();
  };

  const statusDetail = useMemo(() => {
    if (!latestRun) return "No runs yet";
    if (latestRun.status === "blocked") return latestRun.blocked_reason ?? "Blocked";
    return `${latestRun.processed_isins}/${latestRun.total_isins} processed`;
  }, [latestRun]);

  return (
    <div className="min-h-screen bg-stone-50 text-stone-950 dark:bg-stone-950 dark:text-stone-50">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-stone-200 bg-white px-4 py-5 dark:border-stone-800 dark:bg-stone-950 lg:block">
        <div className="mb-8">
          <div className="font-semibold">Consulenza360</div>
          <div className="text-sm text-stone-500">EuroTLX ISIN checks</div>
        </div>
        <nav className="space-y-1">
          <Button className="w-full justify-start" variant={view === "dashboard" ? "default" : "ghost"} onClick={() => setView("dashboard")}>
            <Icon icon={Home01Icon} size={17} />
            Dashboard
          </Button>
          <Button className="w-full justify-start" variant={view === "settings" ? "default" : "ghost"} onClick={() => setView("settings")}>
            <Icon icon={Settings01Icon} size={17} />
            Settings
          </Button>
        </nav>
      </aside>

      <main className="lg:pl-64">
        <header className="sticky top-0 z-10 border-b border-stone-200 bg-stone-50/90 px-4 py-3 backdrop-blur dark:border-stone-800 dark:bg-stone-950/90 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-normal">EuroTLX ISIN Dashboard</h1>
              <p className="text-sm text-stone-500 dark:text-stone-400">Presence monitoring for the imported bond universe.</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={runActive ? "cyan" : "absent"}>{latestRun?.status ?? "idle"}</Badge>
              <Button variant="secondary" onClick={() => setDark((value) => !value)}>
                {dark ? "Light" : "Dark"}
              </Button>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
              {error}
            </div>
          ) : null}

          {view === "dashboard" ? (
            <>
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="Active ISINs" value={summary?.active_isins ?? 0} detail="Source of truth in Supabase" />
                <MetricCard label="Present" value={latestRun?.present_count ?? 0} detail="Latest EuroTLX matches" />
                <MetricCard label="Errors" value={latestRun?.error_count ?? 0} detail={statusDetail} />
                <MetricCard label="Last Run" value={latestRun ? latestRun.status : "Idle"} detail={formatDateTime(latestRun?.started_at)} />
              </section>

              {runActive && latestRun?.id ? <RunExecutionLog runId={latestRun.id} active={runActive} /> : null}
              <DashboardCharts summary={summary} />

              <Card>
                <CardHeader>
                  <CardTitle>Add ISIN</CardTitle>
                  <CardDescription>Additions are stored in Supabase and checked in the next run.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-2 md:grid-cols-[12rem_minmax(0,1fr)_auto]">
                    <Input value={addIsin} onChange={(event) => setAddIsin(event.target.value.toUpperCase())} placeholder="XS0000000000" />
                    <Input value={addName} onChange={(event) => setAddName(event.target.value)} placeholder="Bond name" />
                    <Button onClick={addInstrument}>Add</Button>
                  </div>
                </CardContent>
              </Card>

              <IsinList
                data={isins}
                query={query}
                status={status}
                sorting={sorting}
                onQuery={setQuery}
                onStatus={setStatus}
                onSorting={setSorting}
                onDelete={async (isin) => {
                  await api.deleteIsin(isin);
                  await loadIsins();
                }}
              />
            </>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)]">
              <SettingsPanel
                settings={settings}
                onSave={async (patch) => {
                  setSettings(await api.saveSettings(patch));
                }}
                onManualRun={async () => {
                  await api.startRun();
                  await loadDashboard();
                }}
              />
              <Card>
                <CardHeader>
                  <CardTitle>Operational Notes</CardTitle>
                  <CardDescription>Designed for the Cloudflare Workers Free plan.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-stone-600 dark:text-stone-300">
                  <p>Runs are serialized through Cloudflare Queues with one baton message per chunk.</p>
                  <p>Each chunk checks up to 45 ISINs and writes all results through one Supabase RPC.</p>
                  <p>Borsa redirects, 403, 429, and challenge-like pages stop the run as blocked.</p>
                  <p>Use <span className="font-mono">npm run tail</span> for live Worker traces during deployment tests.</p>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
