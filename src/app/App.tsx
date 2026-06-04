import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CancelCircleIcon,
  Home01Icon,
  LaptopIcon,
  Moon02Icon,
  SearchIcon,
  Settings01Icon,
  Sun01Icon,
} from "@hugeicons/core-free-icons";
import {
  Area,
  AreaChart,
  CartesianGrid,
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
import { cn, formatDateTime, formatTime } from "./lib/utils";
import type { DashboardSummary, IsinListResponse, IsinRow, Settings } from "./types/api";
import { Icon } from "./components/Icon";
import { RunExecutionLog } from "./components/RunExecutionLog";
import { StatusBadge } from "./components/StatusBadge";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "./components/ui/chart";
import { Input } from "./components/ui/input";
import { Switch } from "./components/ui/switch";

const STATUS_COLORS = {
  present: "#06b6d4",
  absent: "#a8a29e",
  error: "#f43f5e",
};

const historyChartConfig = {
  present_count: {
    label: "Present",
    color: "#06b6d4",
  },
  absent_count: {
    label: "Absent",
    color: "#a8a29e",
  },
  error_count: {
    label: "Errors",
    color: "#f43f5e",
  },
} satisfies ChartConfig;

type ThemeMode = "light" | "dark" | "device";

const THEME_STORAGE_KEY = "consulenza360-theme";
const ACTIVE_REFRESH_MS = 4_000;
const IDLE_REFRESH_MS = 15_000;

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark" || value === "device";
}

function ThemeModeControl({ value, onChange }: { value: ThemeMode; onChange: (value: ThemeMode) => void }) {
  const options: { value: ThemeMode; label: string; icon: typeof Sun01Icon }[] = [
    { value: "light", label: "Light", icon: Sun01Icon },
    { value: "dark", label: "Dark", icon: Moon02Icon },
    { value: "device", label: "Device", icon: LaptopIcon },
  ];

  return (
    <div className="grid w-full grid-cols-3 rounded-xl border border-stone-200/70 bg-stone-100/70 p-1 shadow-inner dark:border-stone-800/70 dark:bg-stone-900/65">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={cn(
            "flex h-8 min-w-0 items-center justify-center rounded-lg text-stone-500 transition-all hover:text-stone-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 dark:text-stone-400 dark:hover:text-stone-50",
            value === option.value &&
              "bg-white text-stone-950 shadow-sm hover:text-stone-950 dark:bg-stone-50 dark:text-stone-950 dark:hover:text-stone-950",
          )}
          aria-pressed={value === option.value}
          aria-label={`${option.label} theme`}
          title={`${option.label} theme`}
          onClick={() => onChange(option.value)}
        >
          <Icon icon={option.icon} size={15} />
        </button>
      ))}
    </div>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: ReactNode; detail: ReactNode }) {
  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="font-mono text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0 text-xs text-stone-500 dark:text-stone-400">{detail}</CardContent>
    </Card>
  );
}

function DashboardCharts({ summary }: { summary: DashboardSummary | null }) {
  const history = summary?.history ?? [];
  const latest = summary?.latest_run;
  const historySource =
    history.length > 0
      ? history
      : latest
        ? [
            {
              scheduled_date: latest.scheduled_date,
              present_count: latest.present_count,
              absent_count: latest.absent_count,
              error_count: latest.error_count,
            },
          ]
        : [];
  const historyData = historySource.map((row) => ({
    scheduled_date: row.scheduled_date,
    present_count: Number(row.present_count ?? 0),
    absent_count: Number(row.absent_count ?? 0),
    error_count: Number(row.error_count ?? 0),
  }));
  const pieData = latest
    ? [
        { name: "Present", value: latest.present_count, key: "present" },
        { name: "Absent", value: latest.absent_count, key: "absent" },
        { name: "Errors", value: latest.error_count, key: "error" },
      ]
    : [];
  const hasPieData = pieData.some((entry) => entry.value > 0);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <Card>
        <CardHeader>
          <CardTitle>Historical Presence</CardTitle>
          <CardDescription>Daily EuroTLX snapshots by result state</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="min-w-0">
            {historyData.length > 0 ? (
              <ChartContainer config={historyChartConfig} className="h-72 w-full">
                <AreaChart accessibilityLayer data={historyData} margin={{ left: 12, right: 12, top: 12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fillPresent" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-present_count)" stopOpacity={0.85} />
                      <stop offset="95%" stopColor="var(--color-present_count)" stopOpacity={0.08} />
                    </linearGradient>
                    <linearGradient id="fillAbsent" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-absent_count)" stopOpacity={0.55} />
                      <stop offset="95%" stopColor="var(--color-absent_count)" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="fillError" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-error_count)" stopOpacity={0.55} />
                      <stop offset="95%" stopColor="var(--color-error_count)" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="scheduled_date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={28}
                    tickFormatter={(value: string) =>
                      new Intl.DateTimeFormat("en-GB", { month: "short", day: "numeric" }).format(new Date(value))
                    }
                  />
                  <YAxis tickLine={false} axisLine={false} tickMargin={8} width={36} />
                  <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent config={historyChartConfig} />}
                  />
                  <Area
                    dataKey="present_count"
                    type="natural"
                    fill="url(#fillPresent)"
                    fillOpacity={0.45}
                    stroke="var(--color-present_count)"
                    strokeWidth={2}
                  />
                  <Area
                    dataKey="absent_count"
                    type="natural"
                    fill="url(#fillAbsent)"
                    fillOpacity={0.35}
                    stroke="var(--color-absent_count)"
                    strokeWidth={1.5}
                  />
                  <Area
                    dataKey="error_count"
                    type="natural"
                    fill="url(#fillError)"
                    fillOpacity={0.35}
                    stroke="var(--color-error_count)"
                    strokeWidth={1.5}
                  />
                </AreaChart>
              </ChartContainer>
            ) : (
              <div className="flex h-72 items-center justify-center rounded-2xl border border-dashed border-stone-200/70 bg-[#fbfaf7] text-sm text-stone-500 dark:border-stone-800/70 dark:bg-stone-950/35 dark:text-stone-400">
                No historical runs yet
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Latest Split</CardTitle>
          <CardDescription>Most recent run status mix</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-56 min-w-0">
            {hasPieData ? (
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
            ) : (
              <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-stone-200/70 bg-[#fbfaf7] text-sm text-stone-500 dark:border-stone-800/70 dark:bg-stone-950/35 dark:text-stone-400">
                No latest split yet
              </div>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg border border-cyan-100 bg-cyan-50/80 p-2 text-cyan-700 dark:border-cyan-900/70 dark:bg-cyan-950/50 dark:text-cyan-300">Present</div>
            <div className="rounded-lg border border-stone-200/70 bg-white/80 p-2 text-stone-600 dark:border-stone-800/80 dark:bg-stone-900/70 dark:text-stone-300">Absent</div>
            <div className="rounded-lg border border-rose-100 bg-rose-50/80 p-2 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/50 dark:text-rose-300">Error</div>
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
  const activeCount = data?.total ?? 0;

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>ISIN Universe</CardTitle>
            <CardDescription>
              <span className="font-mono">{activeCount}</span> active instruments
            </CardDescription>
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
            className="h-9 rounded-xl border border-stone-200/70 bg-white px-3 text-sm shadow-sm transition-all focus-visible:border-cyan-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/20 dark:border-stone-800/70 dark:bg-stone-900/70 dark:focus-visible:border-cyan-400"
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
            className="flex min-h-12 w-full items-center gap-3 rounded-2xl border border-stone-200/70 bg-[#fbfaf7] px-3 py-2 shadow-sm transition-colors hover:border-stone-300/80 hover:bg-white dark:border-stone-800/70 dark:bg-stone-950/45 dark:hover:border-stone-700 dark:hover:bg-stone-900/80"
          >
            <div className="flex h-9 w-28 shrink-0 items-center justify-center rounded-xl border border-stone-200/70 bg-white font-mono text-xs font-semibold shadow-sm dark:border-stone-800/70 dark:bg-stone-900">
              {row.isin}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{row.bond_name}</div>
              <div className="truncate text-xs text-stone-500 dark:text-stone-400">Checked {formatDateTime(row.checked_at)}</div>
            </div>
            <StatusBadge status={row.status ?? "unchecked"} />
            <div className="hidden w-20 text-right font-mono text-xs text-stone-500 md:block">{row.response_time ? `${row.response_time}ms` : ""}</div>
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
          <div className="rounded-2xl border border-dashed border-stone-200/80 bg-[#fbfaf7] p-8 text-center text-sm text-stone-500 dark:border-stone-800/80 dark:bg-stone-900/30">
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
        <label className="flex items-center justify-between gap-4 rounded-xl border border-stone-200/80 bg-stone-50/60 p-3 shadow-sm dark:border-stone-800/80 dark:bg-stone-900/40">
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
        <label className="flex items-center justify-between gap-4 rounded-xl border border-stone-200/80 bg-stone-50/60 p-3 shadow-sm dark:border-stone-800/80 dark:bg-stone-900/40">
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
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(stored) ? stored : "device";
  });
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [isins, setIsins] = useState<IsinListResponse | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [sorting, setSorting] = useState<SortingState>([{ id: "isin", desc: false }]);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const useDark = themeMode === "dark" || (themeMode === "device" && mediaQuery.matches);
      document.documentElement.classList.toggle("dark", useDark);
      document.documentElement.style.colorScheme = useDark ? "dark" : "light";
    };

    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
    applyTheme();
    mediaQuery.addEventListener("change", applyTheme);

    return () => mediaQuery.removeEventListener("change", applyTheme);
  }, [themeMode]);

  const latestRun = summary?.latest_run;
  const runActive = latestRun?.status === "pending" || latestRun?.status === "processing";

  const loadDashboard = useCallback(async () => {
    try {
      const [dashboardData, settingsData] = await Promise.all([api.dashboard(), api.settings()]);
      setSummary(dashboardData);
      setSettings(settingsData);
      setLastSyncedAt(new Date().toISOString());
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load dashboard.");
    }
  }, []);

  const loadIsins = useCallback(async () => {
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
  }, [query, sorting, status]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    void loadIsins();
  }, [loadIsins]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void loadDashboard();
      if (view === "dashboard") void loadIsins();
    };

    const interval = window.setInterval(refresh, runActive ? ACTIVE_REFRESH_MS : IDLE_REFRESH_MS);
    window.addEventListener("focus", refresh);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [loadDashboard, loadIsins, runActive, view]);

  const statusDetail = useMemo(() => {
    if (!latestRun) return "No runs yet";
    if (latestRun.status === "blocked") return latestRun.blocked_reason ?? "Blocked";
    return (
      <>
        <span className="font-mono">
          {latestRun.processed_isins}/{latestRun.total_isins}
        </span>{" "}
        processed
      </>
    );
  }, [latestRun]);

  return (
    <div className="min-h-screen bg-[#f4f1ec] text-stone-950 dark:bg-[#11100e] dark:text-stone-50">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-stone-200/70 bg-[#fbfaf7] px-4 py-5 shadow-[12px_0_48px_rgba(28,25,23,0.08)] dark:border-stone-800/70 dark:bg-[#171513] dark:shadow-[12px_0_48px_rgba(0,0,0,0.18)] lg:block">
        <div className="mb-8">
          <div className="font-semibold">Consulenza360</div>
          <div className="text-sm text-stone-500">EuroTLX ISIN checks</div>
        </div>
        <nav className="space-y-1">
          <Button className="w-full justify-start" variant={view === "dashboard" ? "default" : "ghost"} onClick={() => setView("dashboard")}>
            <Icon icon={Home01Icon} size={17} />
            Dashboard
          </Button>
          <div className="py-2">
            <ThemeModeControl value={themeMode} onChange={setThemeMode} />
          </div>
          <Button className="w-full justify-start" variant={view === "settings" ? "default" : "ghost"} onClick={() => setView("settings")}>
            <Icon icon={Settings01Icon} size={17} />
            Settings
          </Button>
        </nav>
      </aside>

      <main className="lg:pl-64">
        <header className="sticky top-0 z-10 border-b border-stone-200/70 bg-[#f4f1ec]/90 px-4 py-3 backdrop-blur-xl dark:border-stone-800/70 dark:bg-[#11100e]/90 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-normal">EuroTLX ISIN Dashboard</h1>
              <p className="text-sm text-stone-500 dark:text-stone-400">Presence monitoring for the imported bond universe.</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={runActive ? "cyan" : "absent"}>{latestRun?.status ?? "idle"}</Badge>
              <span className="hidden font-mono text-xs text-stone-500 dark:text-stone-400 sm:inline">
                {formatTime(lastSyncedAt)}
              </span>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
          {error ? (
            <div className="rounded-xl border border-rose-200/80 bg-rose-50/80 p-3 text-sm text-rose-700 shadow-sm dark:border-rose-900/80 dark:bg-rose-950/50 dark:text-rose-300">
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
