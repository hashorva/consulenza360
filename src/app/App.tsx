import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Add01Icon,
  ArchiveRestoreIcon,
  ArrowReloadHorizontalIcon,
  BadgeAlertIcon,
  BadgeCheckIcon,
  DashboardBrowsingIcon,
  Delete02Icon,
  Download01Icon,
  Edit01Icon,
  LaptopIcon,
  LeftToRightListNumberIcon,
  Login01Icon,
  Logout01Icon,
  Moon02Icon,
  NewsIcon,
  SearchIcon,
  SearchList02Icon,
  Settings05Icon,
  Sun01Icon,
  Upload01Icon,
} from "@hugeicons/core-free-icons";
import readXlsxFile from "read-excel-file/browser";
import { Toaster, toast as sonnerToast } from "sonner";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Label,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import { getCoreRowModel, type SortingState, useReactTable } from "@tanstack/react-table";
import { api } from "./lib/api";
import { cn, formatDateTime, formatTime } from "./lib/utils";
import type { AppEventListResponse, DashboardSummary, Identity, IsinListResponse, IsinRow, ManualRunDecision, RunLogs, Settings, UserSettings } from "./types/api";
import { Icon } from "./components/Icon";
import { RunExecutionLog } from "./components/RunExecutionLog";
import { StatusBadge } from "./components/StatusBadge";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "./components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "./components/ui/chart";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "./components/ui/dialog";
import { Input } from "./components/ui/input";
import { Switch } from "./components/ui/switch";

const STATUS_COLORS = {
  present: "var(--present)",
  absent: "var(--absent)",
  error: "var(--error)",
};

const historyChartConfig = {
  present_count: {
    label: "Present",
    color: "var(--present)",
  },
  absent_count: {
    label: "Absent",
    color: "var(--absent)",
  },
  error_count: {
    label: "Errors",
    color: "var(--error)",
  },
} satisfies ChartConfig;

const splitChartConfig = {
  present: {
    label: "Present",
    color: "var(--present)",
  },
  absent: {
    label: "Absent",
    color: "var(--absent)",
  },
  error: {
    label: "Errors",
    color: "var(--error)",
  },
} satisfies ChartConfig;

type ThemeMode = "light" | "dark" | "device";
type AppRoute = "/" | "/isin" | "/logs";
type SettingsTab = "general" | "dashboard" | "operations";

const THEME_COOKIE_KEY = "consulenza360_sidebar_theme";
const ISIN_PATTERN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
const ACTIVE_REFRESH_MS = 4_000;
const IDLE_REFRESH_MS = 15_000;

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark" || value === "device";
}

function getCookie(name: string) {
  return document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`))
    ?.split("=")[1] ?? null;
}

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; SameSite=Lax`;
}

function applyThemeMode(mode: ThemeMode) {
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const useDark = mode === "dark" || (mode === "device" && mediaQuery.matches);
  document.documentElement.classList.toggle("dark", useDark);
  document.documentElement.style.colorScheme = useDark ? "dark" : "light";
}

function currentRoute(): AppRoute {
  if (window.location.pathname === "/isin") return "/isin";
  if (window.location.pathname === "/logs") return "/logs";
  return "/";
}

function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
}

function manualRunReasonLabel(reason: ManualRunDecision["reason"]) {
  if (reason === "active_run") return "A scan is already running.";
  if (reason === "daily_limit") return "Daily manual run limit reached.";
  if (reason === "cooldown") return "Manual checks are cooling down.";
  return "Manual check is not available right now.";
}

function ManualRunDeniedToast({ decision }: { decision: ManualRunDecision }) {
  const [now, setNow] = useState(() => Date.now());
  const nextAllowedTime = decision.next_allowed_at ? new Date(decision.next_allowed_at).getTime() : null;
  const secondsLeft = nextAllowedTime ? Math.max(0, Math.ceil((nextAllowedTime - now) / 1000)) : decision.seconds_until_next;

  useEffect(() => {
    if (!nextAllowedTime) return undefined;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [nextAllowedTime]);

  return (
    <div className="space-y-1">
      <div className="font-medium">{manualRunReasonLabel(decision.reason)}</div>
      {decision.reason === "active_run" ? (
        <div className="text-xs text-stone-500">Wait for the current queue run to finish before starting another one.</div>
      ) : (
        <div className="text-xs text-stone-500">
          Try again in <span className="font-mono font-semibold text-stone-800 dark:text-stone-100">{formatDuration(secondsLeft)}</span>.
        </div>
      )}
      <div className="text-xs text-stone-500">
        Manual runs left today: {decision.remaining_today}/{decision.manual_refresh_limit}
      </div>
    </div>
  );
}

function ThemeModeControl({ value, onChange }: { value: ThemeMode; onChange: (value: ThemeMode) => void }) {
  const options: { value: ThemeMode; label: string; icon: typeof Sun01Icon; colorClass: string }[] = [
    { value: "light", label: "Light", icon: Sun01Icon, colorClass: "hover:text-amber-500" },
    { value: "dark", label: "Dark", icon: Moon02Icon, colorClass: "hover:text-indigo-600" },
    { value: "device", label: "Device", icon: LaptopIcon, colorClass: "hover:text-cyan-500" },
  ];

  return (
    <div className="mx-auto inline-grid grid-cols-3 rounded-full border border-stone-200/70 bg-stone-100/70 p-1 shadow-inner dark:border-stone-800/70 dark:bg-stone-900/65">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={cn(
            "flex h-8 w-9 items-center justify-center rounded-full text-stone-500 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 dark:text-stone-400",
            option.colorClass,
            value === option.value &&
              "bg-white shadow-sm dark:bg-stone-50",
            value === "light" && option.value === "light" && "text-amber-500",
            value === "dark" && option.value === "dark" && "text-indigo-600",
            value === "device" && option.value === "device" && "text-cyan-500",
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

function MetricCard({
  label,
  value,
  detail,
  icon,
  accentColor = "system"
}: {
  label: string;
  value: ReactNode;
  detail: ReactNode;
  icon?: any;
  accentColor?: "system" | "present" | "absent" | "error";
}) {
  return (
    <Card className="relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl border border-stone-200/60 dark:border-stone-850 min-w-0">
      <CardHeader className="flex flex-row items-center justify-between p-3 sm:p-5 pb-2 min-w-0">
        <div className="space-y-1 min-w-0 w-full">
          <CardDescription className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 truncate w-full">{label}</CardDescription>
          <CardTitle className={cn(
            "font-mono text-3xl font-bold tracking-tight w-full truncate",
            accentColor === "system" && "text-system",
            accentColor === "present" && "text-present",
            accentColor === "absent" && "text-absent",
            accentColor === "error" && "text-error"
          )}>{value}</CardTitle>
        </div>
        {icon && (
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl shrink-0",
            accentColor === "system" && "bg-system/10 text-system",
            accentColor === "present" && "bg-present/10 text-present",
            accentColor === "absent" && "bg-absent/10 text-absent",
            accentColor === "error" && "bg-error/10 text-error",
          )}>
            <Icon icon={icon} size={20} />
          </div>
        )}
      </CardHeader>
      <CardContent className="px-3 sm:px-5 pb-3 sm:pb-5 pt-1 text-xs text-stone-500 dark:text-stone-400 truncate w-full">{detail}</CardContent>
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
        { name: "Present", value: latest.present_count, key: "present", fill: "var(--present)" },
        { name: "Absent", value: latest.absent_count, key: "absent", fill: "var(--absent)" },
        { name: "Errors", value: latest.error_count, key: "error", fill: "var(--error)" },
      ]
    : [];
  const hasPieData = pieData.some((entry) => entry.value > 0);

  // SVG-based Donut segment calculations (no Recharts)
  const presentCount = latest?.present_count ?? 0;
  const absentCount = latest?.absent_count ?? 0;
  const errorCount = latest?.error_count ?? 0;
  const total = latest?.total_isins ?? (presentCount + absentCount + errorCount);
  const r = 70;
  const strokeWidth = 14;
  const circumference = 2 * Math.PI * r;

  const rawSegments = [
    { key: "present", value: presentCount, color: "var(--present)" },
    { key: "absent", value: absentCount, color: "var(--absent)" },
    { key: "error", value: errorCount, color: "var(--error)" },
  ];

  let accumulatedPercentage = 0;
  const svgSegments = rawSegments
    .filter(s => s.value > 0)
    .map(s => {
      const percentage = s.value / total;
      const strokeDashoffset = circumference * (1 - percentage);
      const angle = -90 + (accumulatedPercentage * 360);
      accumulatedPercentage += percentage;
      return {
        ...s,
        strokeDashoffset,
        angle,
      };
    });

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2 relative overflow-hidden">
        <CardHeader>
          <CardTitle>Historical Presence</CardTitle>
          <CardDescription>Daily EuroTLX snapshots by result state</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="min-w-0">
            {historyData.length > 0 ? (
              <ChartContainer config={historyChartConfig} className="h-72 w-full">
                <AreaChart accessibilityLayer data={historyData} margin={{ left: 12, right: 12, top: 12, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--color-stone-200)" className="opacity-30 dark:stroke-stone-800" />
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
                    type="monotone"
                    fill="var(--present)"
                    fillOpacity={0.12}
                    stroke="var(--present)"
                    strokeWidth={2}
                  />
                  <Area
                    dataKey="absent_count"
                    type="monotone"
                    fill="var(--absent)"
                    fillOpacity={0.06}
                    stroke="var(--absent)"
                    strokeWidth={1.5}
                  />
                  <Area
                    dataKey="error_count"
                    type="monotone"
                    fill="var(--error)"
                    fillOpacity={0.06}
                    stroke="var(--error)"
                    strokeWidth={1.5}
                  />
                </AreaChart>
              </ChartContainer>
            ) : (
              <div className="flex h-72 items-center justify-center rounded-2xl border border-dashed border-stone-200/70 bg-stone-50 text-sm text-stone-500 dark:border-stone-800/70 dark:bg-stone-950/35 dark:text-stone-400">
                No historical runs yet
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="hidden lg:flex flex-col">
        <CardHeader className="pb-0">
          <CardTitle>Latest Split</CardTitle>
          <CardDescription>Most recent run status mix</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 pb-0 flex flex-col justify-center">
          {hasPieData ? (
            <ChartContainer
              config={splitChartConfig}
              className="mx-auto aspect-square w-full max-h-52"

            >
              <PieChart>
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent />}
                />
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={60}
                  strokeWidth={8}
                >
                  <Label
                    content={({ viewBox }) => {
                      if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                        return (
                          <text
                            x={viewBox.cx}
                            y={viewBox.cy}
                            textAnchor="middle"
                            dominantBaseline="middle"
                          >
                            <tspan
                              x={viewBox.cx}
                              y={viewBox.cy}
                              className="fill-stone-900 dark:fill-stone-50 text-3xl font-bold tracking-tight font-mono"
                            >
                              {(latest?.total_isins ?? 0).toLocaleString()}
                            </tspan>
                            <tspan
                              x={viewBox.cx}
                              y={(viewBox.cy || 0) + 24}
                              className="fill-stone-500 dark:fill-stone-400 text-xs font-sans"
                            >
                              Checked
                            </tspan>
                          </text>
                        )
                      }
                    }}
                  />
                </Pie>
              </PieChart>
            </ChartContainer>
          ) : (
            <div className="flex h-48 w-full items-center justify-center rounded-2xl border border-dashed border-stone-200/70 bg-stone-50 text-sm text-stone-500 dark:border-stone-800/70 dark:bg-stone-950/35 dark:text-stone-400 mt-2">
              No latest split yet
            </div>
          )}
        </CardContent>
        {hasPieData && (
          <CardFooter className="flex-col gap-2 text-sm">
            <div className="flex flex-wrap justify-center gap-2 text-xs font-sans">
              <div className="flex items-center gap-1.5 rounded-full border border-present/20 bg-present/10 px-2.5 py-0.5 text-present font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-present" />
                <span>Present: <span className="font-mono">{latest?.present_count ?? 0}</span></span>
              </div>
              <div className="flex items-center gap-1.5 rounded-full border border-absent/20 bg-absent/10 px-2.5 py-0.5 text-absent font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-absent" />
                <span>Absent: <span className="font-mono">{latest?.absent_count ?? 0}</span></span>
              </div>
              <div className="flex items-center gap-1.5 rounded-full border border-error/20 bg-error/10 px-2.5 py-0.5 text-error font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-error" />
                <span>Error: <span className="font-mono">{latest?.error_count ?? 0}</span></span>
              </div>
            </div>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}

function IsinList({
  data,
  query,
  status,
  sorting,
  title = "ISIN Universe",
  description,
  management = false,
  onQuery,
  onStatus,
  onSorting,
  onDelete,
  onEdit,
  onRestore,
}: {
  data: IsinListResponse | null;
  query: string;
  status: string;
  sorting: SortingState;
  title?: string;
  description?: ReactNode;
  management?: boolean;
  onQuery: (value: string) => void;
  onStatus: (value: string) => void;
  onSorting: (value: SortingState) => void;
  onDelete?: (isin: string) => void;
  onEdit?: (row: IsinRow) => void;
  onRestore?: (isin: string) => void;
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
    <Card className="border border-stone-200/60 dark:border-stone-850 shadow-md">
      <CardHeader className="gap-3.5 p-5 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description ?? <><span className="font-mono font-medium text-stone-700 dark:text-stone-300">{activeCount}</span> active instruments</>}</CardDescription>
          </div>
          {!management ? (
            <div className="inline-flex h-9 items-center rounded-xl bg-stone-100 p-1 dark:bg-stone-900 border border-stone-200/50 dark:border-stone-800/60 shadow-inner">
              {[
                { id: "all", label: "All" },
                { id: "present", label: "Present" },
                { id: "absent", label: "Absent" },
                { id: "error", label: "Error" },
              ].map((tab) => {
                const active = status === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => onStatus(tab.id)}
                    className={cn(
                      "px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer duration-150 focus-visible:outline-none",
                      active
                        ? "bg-white text-stone-900 shadow-sm dark:bg-stone-800 dark:text-stone-100"
                        : "text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"
                    )}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
        <div className="flex flex-col gap-2.5 md:flex-row">
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
      <CardContent className="space-y-2 p-5 pt-0">
        {rows.map((row) => (
          <article
            key={row.isin}
            className="group flex min-h-12 w-full items-center gap-3 rounded-2xl border border-stone-200/50 bg-stone-50/65 px-3 py-2 shadow-sm transition-all duration-300 hover:border-stone-300 dark:border-stone-900/50 dark:bg-stone-950/20 dark:hover:border-stone-850 hover:bg-white dark:hover:bg-stone-900/40 hover:-translate-y-0.5"
          >
            <div className="flex h-9 w-28 shrink-0 items-center justify-center rounded-xl border border-stone-200/70 bg-white font-mono text-xs font-semibold shadow-inner dark:border-stone-800/80 dark:bg-stone-900 text-stone-700 dark:text-stone-300">
              {row.isin}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-stone-900 dark:text-stone-100">{row.bond_name}</div>
              <div className="truncate text-xs text-stone-450 dark:text-stone-500">Checked <span className="font-mono">{formatDateTime(row.checked_at)}</span></div>
            </div>
            <StatusBadge status={row.status ?? "unchecked"} />
            <div className="hidden w-16 text-right font-mono text-xs text-stone-500 md:block">{row.response_time ? `${row.response_time}ms` : ""}</div>

            <div className="flex items-center gap-1.5 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-200">
              {row.source_url ? (
                <Button asChild variant="secondary" size="sm" className="h-8 rounded-lg px-2.5">
                  <a href={row.source_url} target="_blank" rel="noreferrer">
                    Source
                  </a>
                </Button>
              ) : null}
              {onEdit ? (
                <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg text-stone-500 dark:text-stone-400 hover:text-cyan-500 dark:hover:text-cyan-400" onClick={() => onEdit(row)} aria-label={`Edit ${row.isin}`}>
                  <Icon icon={Edit01Icon} size={15} />
                </Button>
              ) : null}
              {onRestore && !row.active ? (
                <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg text-stone-500 dark:text-stone-400 hover:text-cyan-500 dark:hover:text-cyan-400" onClick={() => onRestore(row.isin)} aria-label={`Restore ${row.isin}`}>
                  <Icon icon={ArchiveRestoreIcon} size={15} />
                </Button>
              ) : null}
              {onDelete && row.active !== false ? (
                <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg text-stone-500 dark:text-stone-400 hover:text-rose-500 dark:hover:text-rose-400" onClick={() => onDelete(row.isin)} aria-label={`Delete ${row.isin}`}>
                  <Icon icon={Delete02Icon} size={15} />
                </Button>
              ) : null}
            </div>
          </article>
        ))}
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-200/80 bg-stone-50 p-8 text-center text-sm text-stone-500 dark:border-stone-800/80 dark:bg-stone-900/30">
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

function AddEditIsinDialog({
  open,
  row,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  row: IsinRow | null;
  onOpenChange: (open: boolean) => void;
  onSave: (body: { isin: string; bond_name: string }) => Promise<void>;
}) {
  const [isin, setIsin] = useState("");
  const [bondName, setBondName] = useState("");

  useEffect(() => {
    setIsin(row?.isin ?? "");
    setBondName(row?.bond_name ?? "");
  }, [row, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{row ? "Edit ISIN" : "Add ISIN"}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <label className="block space-y-2">
            <span className="text-sm font-medium">ISIN</span>
            <Input className="font-mono" value={isin} disabled={!!row} onChange={(event) => setIsin(event.target.value.toUpperCase())} />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium">Bond name</span>
            <Input value={bondName} onChange={(event) => setBondName(event.target.value)} />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={() => onSave({ isin, bond_name: bondName })}>Save</Button>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const rows = lines.slice(1).map((line) => {
    const [isin, ...nameParts] = line.split(",");
    return { isin: String(isin ?? "").trim().toUpperCase(), bond_name: nameParts.join(",").trim() };
  });
  return rows;
}

function ImportIsinsDialog({
  open,
  onOpenChange,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (rows: Array<{ isin: string; bond_name: string }>) => Promise<void>;
}) {
  const [mode, setMode] = useState<"csv" | "xlsx">("csv");
  const [rows, setRows] = useState<Array<{ isin: string; bond_name: string }>>([]);

  const invalidCount = rows.filter((row) => !ISIN_PATTERN.test(row.isin) || !row.bond_name).length;
  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent("isin,bond_name\nXS0000000000,Bond name\n")}`;

  const readFile = async (file: File) => {
    if (mode === "csv") {
      setRows(parseCsv(await file.text()));
      return;
    }
    const workbook = await readXlsxFile(file);
    const workbookRows = Array.isArray(workbook) && workbook[0] && "data" in workbook[0] ? workbook[0].data : [];
    setRows(
      workbookRows.slice(1).map((row) => ({
        isin: String(row[0] ?? "").trim().toUpperCase(),
        bond_name: String(row[1] ?? "").trim(),
      })),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Batch Import</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="rounded-2xl border border-stone-200/70 bg-white p-4 text-sm dark:border-stone-800/70 dark:bg-stone-900/60">
            Use the standard columns <span className="font-mono">isin,bond_name</span>. Download the template, fill it, then upload as CSV or XLSX.
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant={mode === "csv" ? "default" : "secondary"} onClick={() => setMode("csv")}>CSV</Button>
            <Button variant={mode === "xlsx" ? "default" : "secondary"} onClick={() => setMode("xlsx")}>XLSX</Button>
            <Button asChild variant="secondary">
              <a href={templateHref} download="isin-template.csv"><Icon icon={Download01Icon} size={16} />Template</a>
            </Button>
          </div>
          <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-stone-300 bg-stone-50 text-sm text-stone-500 dark:border-stone-700 dark:bg-stone-950/35">
            <Icon icon={Upload01Icon} size={22} />
            Upload {mode.toUpperCase()} file
            <input className="sr-only" type="file" accept={mode === "csv" ? ".csv,text/csv" : ".xlsx,.xls"} onChange={(event) => event.target.files?.[0] && void readFile(event.target.files[0])} />
          </label>
          {rows.length ? (
            <div className="max-h-52 overflow-y-auto rounded-2xl border border-stone-200/70 dark:border-stone-800/70">
              {rows.slice(0, 80).map((row, index) => (
                <div key={`${row.isin}-${index}`} className="grid grid-cols-3 gap-3 border-b border-stone-200/60 px-3 py-2 text-sm last:border-0 dark:border-stone-800/60">
                  <span className="font-mono">{row.isin}</span>
                  <span className={cn("col-span-2 truncate", (!ISIN_PATTERN.test(row.isin) || !row.bond_name) && "text-rose-600")}>{row.bond_name || "Missing bond name"}</span>
                </div>
              ))}
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button disabled={!rows.length || invalidCount > 0} onClick={() => onImport(rows)}>Import</Button>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function SearchDialog({
  open,
  query,
  data,
  onOpenChange,
  onQuery,
}: {
  open: boolean;
  query: string;
  data: IsinListResponse | null;
  onOpenChange: (open: boolean) => void;
  onQuery: (value: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Search</DialogTitle>
        </DialogHeader>
        <div className="border-b border-stone-200/70 p-4 dark:border-stone-800/70">
          <div className="relative">
            <Icon icon={SearchIcon} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={16} />
            <Input className="pl-9" autoFocus value={query} onChange={(event) => onQuery(event.target.value)} />
          </div>
        </div>
        <DialogBody className="max-h-96 space-y-2">
          {(data?.rows ?? []).map((row) => (
            <div key={row.isin} className="flex items-center gap-3 rounded-2xl border border-stone-200/70 bg-white px-3 py-2 dark:border-stone-800/70 dark:bg-stone-900/60">
              <span className="w-28 font-mono text-xs font-semibold">{row.isin}</span>
              <span className="min-w-0 flex-1 truncate text-sm">{row.bond_name}</span>
              <StatusBadge status={row.status ?? "unchecked"} />
            </div>
          ))}
          {data?.rows?.length === 0 ? <div className="p-8 text-center text-sm text-stone-500">No results</div> : null}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function SettingsDialog({
  open,
  settings,
  userSettings,
  themeMode,
  activeTab,
  onOpenChange,
  onTab,
  onSaveSettings,
  onSaveUserSettings,
  onManualRun,
  onChangeThemeMode,
}: {
  open: boolean;
  settings: Settings | null;
  userSettings: UserSettings | null;
  themeMode: ThemeMode;
  activeTab: SettingsTab;
  onOpenChange: (open: boolean) => void;
  onTab: (tab: SettingsTab) => void;
  onSaveSettings: (settings: Partial<Settings>) => Promise<void>;
  onSaveUserSettings: (settings: Partial<UserSettings>) => Promise<void>;
  onManualRun: () => Promise<void>;
  onChangeThemeMode: (mode: ThemeMode) => void;
}) {
  const tabs: Array<{ id: SettingsTab; label: string }> = [
    { id: "general", label: "General" },
    { id: "dashboard", label: "Dashboard" },
    { id: "operations", label: "Operations" },
  ];
  const [runHour, setRunHour] = useState(settings?.run_hour ?? 10);
  const [refreshSeconds, setRefreshSeconds] = useState(userSettings?.dashboard_refresh_seconds ?? 15);
  const [cooldownMinutes, setCooldownMinutes] = useState(settings?.manual_refresh_cooldown_minutes ?? 30);
  const [dailyLimit, setDailyLimit] = useState(settings?.manual_refresh_daily_limit ?? 8);

  useEffect(() => {
    if (settings) {
      setRunHour(settings.run_hour);
      setCooldownMinutes(settings.manual_refresh_cooldown_minutes);
      setDailyLimit(settings.manual_refresh_daily_limit);
    }
  }, [settings]);
  useEffect(() => {
    if (userSettings) setRefreshSeconds(userSettings.dashboard_refresh_seconds);
  }, [userSettings]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <div className="flex max-h-screen min-h-96 flex-col lg:grid lg:grid-cols-4">
          <aside className="overflow-x-auto border-b border-stone-200/70 p-3 dark:border-stone-800/70 lg:border-b-0 lg:border-r">
            <nav className="flex gap-2 lg:flex-col">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  className={cn(
                    "whitespace-nowrap rounded-full px-3 py-2 text-left text-sm text-stone-500 transition hover:bg-stone-100 hover:text-stone-950 dark:hover:bg-stone-900 dark:hover:text-stone-50",
                    activeTab === tab.id && "bg-stone-200/70 font-medium text-stone-950 dark:bg-stone-800 dark:text-stone-50",
                  )}
                  onClick={() => onTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </aside>
          <DialogBody className="space-y-5 lg:col-span-3">
            {activeTab === "general" ? (
              <>
                <section className="space-y-3">
                  <h3 className="font-semibold">Appearance</h3>
                  <div className="flex items-center justify-between gap-4 border-b border-stone-200/70 py-3 dark:border-stone-800/70">
                    <span className="text-sm">User theme preference</span>
                    <ThemeModeControl value={themeMode} onChange={onChangeThemeMode} />
                  </div>
                  <div className="flex items-center justify-between gap-4 border-b border-stone-200/70 py-3 dark:border-stone-800/70">
                    <span className="text-sm">Sidebar quick theme</span>
                    <span className="font-mono text-xs text-stone-500">{themeMode}</span>
                  </div>
                </section>
                <section className="space-y-2">
                  <h3 className="font-semibold">Timezone</h3>
                  <Input value={userSettings?.timezone ?? "Europe/Rome"} onChange={(event) => void onSaveUserSettings({ timezone: event.target.value })} />
                </section>
              </>
            ) : null}
            {activeTab === "dashboard" ? (
              <section className="space-y-4">
                <h3 className="font-semibold">Dashboard</h3>
                <label className="block space-y-2">
                  <span className="text-sm">Refresh interval</span>
                  <div className="flex gap-2">
                    <Input type="number" min={4} max={300} value={refreshSeconds} onChange={(event) => setRefreshSeconds(Number(event.target.value))} />
                    <Button onClick={() => onSaveUserSettings({ dashboard_refresh_seconds: refreshSeconds })}>Save</Button>
                  </div>
                </label>
                <div className="flex items-center justify-between border-b border-stone-200/70 py-3 dark:border-stone-800/70">
                  <span className="text-sm">Chart display</span>
                  <Badge variant="cyan">Area</Badge>
                </div>
              </section>
            ) : null}
            {activeTab === "operations" ? (
              <section className="space-y-4">
                <h3 className="font-semibold">Operations</h3>
                <label className="flex items-center justify-between gap-4 rounded-2xl border border-stone-200/80 bg-white p-3 dark:border-stone-800/80 dark:bg-stone-900/60">
                  <span className="text-sm font-medium">Automation</span>
                  <Switch checked={settings?.enabled ?? false} onCheckedChange={(enabled) => void onSaveSettings({ enabled })} />
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium">Run hour</span>
                  <div className="flex gap-2">
                    <Input type="number" min={0} max={23} value={runHour} onChange={(event) => setRunHour(Number(event.target.value))} />
                    <Button onClick={() => onSaveSettings({ run_hour: runHour })}>Save</Button>
                  </div>
                </label>
                <label className="flex items-center justify-between gap-4 rounded-2xl border border-stone-200/80 bg-white p-3 dark:border-stone-800/80 dark:bg-stone-900/60">
                  <span className="text-sm font-medium">Weekdays only</span>
                  <Switch checked={settings?.weekday_only ?? true} onCheckedChange={(weekday_only) => void onSaveSettings({ weekday_only })} />
                </label>
                <div className="rounded-2xl border border-amber-200/80 bg-amber-50/80 p-3 text-xs text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200">
                  Manual runs contact Borsa Italiana immediately. Keep these limits conservative to avoid repeated fetch bursts and blocked traffic.
                </div>
                <label className="block space-y-2">
                  <span className="text-sm font-medium">Manual cooldown</span>
                  <div className="flex gap-2">
                    <Input type="number" min={15} max={240} value={cooldownMinutes} onChange={(event) => setCooldownMinutes(Number(event.target.value))} />
                    <Button onClick={() => onSaveSettings({ manual_refresh_cooldown_minutes: cooldownMinutes })}>Save</Button>
                  </div>
                  <span className="text-xs text-stone-500">Allowed range: 15-240 minutes. Current default is 30 minutes.</span>
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium">Daily manual limit</span>
                  <div className="flex gap-2">
                    <Input type="number" min={1} max={8} value={dailyLimit} onChange={(event) => setDailyLimit(Number(event.target.value))} />
                    <Button onClick={() => onSaveSettings({ manual_refresh_daily_limit: dailyLimit })}>Save</Button>
                  </div>
                  <span className="text-xs text-stone-500">Allowed range: 1-8 manual runs per Europe/Rome day.</span>
                </label>
                <Button className="w-full" onClick={onManualRun}>Start manual run</Button>
              </section>
            ) : null}
          </DialogBody>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LogsPage({ events, runLogs }: { events: AppEventListResponse | null; runLogs: RunLogs | null }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>User Events</CardTitle>
          <CardDescription>{events?.total ?? 0} logged events</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(events?.rows ?? []).filter((event) => event.source === "user").map((event) => (
            <div key={event.id} className="rounded-2xl border border-stone-200/70 bg-stone-50 p-3 dark:border-stone-800/70 dark:bg-stone-950/35">
              <div className="text-sm font-medium">{event.message}</div>
              <div className="text-xs text-stone-500">{formatDateTime(event.created_at)}</div>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Worker Logs</CardTitle>
          <CardDescription>Latest run events</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 font-mono text-xs">
          {(runLogs?.processingItems ?? []).map((item) => (
            <div key={`processing-${item.isin}`} className="rounded-xl border border-stone-200/70 p-3 dark:border-stone-800/70">
              [{formatTime(item.claimed_at)}] {item.isin} processing
            </div>
          ))}
          {(runLogs?.recentChecks ?? []).map((log) => (
            <div key={`${log.isin}-${log.checked_at}`} className="rounded-xl border border-stone-200/70 p-3 dark:border-stone-800/70">
              [{formatTime(log.checked_at)}] {log.isin} {log.status} {log.response_time ?? 0}ms
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export function App() {
  const [route, setRoute] = useState<AppRoute>(() => currentRoute());
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  const [importOpen, setImportOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingIsin, setEditingIsin] = useState<IsinRow | null>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const stored = getCookie(THEME_COOKIE_KEY);
    const decoded = stored ? decodeURIComponent(stored) : null;
    return isThemeMode(decoded) ? decoded : "device";
  });
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [isins, setIsins] = useState<IsinListResponse | null>(null);
  const [deletedIsins, setDeletedIsins] = useState<IsinListResponse | null>(null);
  const [events, setEvents] = useState<AppEventListResponse | null>(null);
  const [runLogs, setRunLogs] = useState<RunLogs | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [sorting, setSorting] = useState<SortingState>([{ id: "isin", desc: false }]);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; level: "success" | "error" | "info" } | null>(null);
  const [manualRunPending, setManualRunPending] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => applyThemeMode(themeMode);

    applyTheme();
    mediaQuery.addEventListener("change", applyTheme);

    return () => mediaQuery.removeEventListener("change", applyTheme);
  }, [themeMode]);

  // Theme preference is managed entirely locally in cookies to prevent DB sync delay and flash of un-styled content.

  useEffect(() => {
    const onPopState = () => setRoute(currentRoute());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const latestRun = summary?.latest_run;
  const runActive = latestRun?.status === "pending" || latestRun?.status === "processing";

  const navigate = useCallback((nextRoute: AppRoute) => {
    window.history.pushState({}, "", nextRoute);
    setRoute(nextRoute);
  }, []);

  const notify = useCallback((message: string, level: "success" | "error" | "info" = "success") => {
    setToast({ message, level });
  }, []);

  const loadDashboard = useCallback(async () => {
    try {
      const [dashboardData, settingsData, userSettingsData, identityData] = await Promise.all([
        api.dashboard(),
        api.settings(),
        api.userSettings(),
        api.me(),
      ]);
      setSummary(dashboardData);
      setSettings(settingsData);
      setUserSettings(userSettingsData);
      setIdentity(identityData);
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

  const loadDeletedIsins = useCallback(async () => {
    const params = new URLSearchParams({ q: "", page_size: "80" });
    setDeletedIsins(await api.deletedIsins(params));
  }, []);

  const loadEvents = useCallback(async () => {
    const params = new URLSearchParams({ source: "all", page_size: "80" });
    setEvents(await api.events(params));
  }, []);

  const loadRunLogs = useCallback(async () => {
    if (!latestRun?.id) {
      setRunLogs(null);
      return;
    }
    setRunLogs(await api.runLogs(latestRun.id));
  }, [latestRun?.id]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    void loadIsins();
  }, [loadIsins]);

  useEffect(() => {
    if (route === "/isin") void loadDeletedIsins();
    if (route === "/logs") {
      void loadEvents();
      void loadRunLogs();
    }
  }, [loadDeletedIsins, loadEvents, loadRunLogs, route]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void loadDashboard();
      if (route === "/" || route === "/isin") void loadIsins();
      if (route === "/logs") void loadEvents();
    };

    const interval = window.setInterval(refresh, runActive ? ACTIVE_REFRESH_MS : IDLE_REFRESH_MS);
    window.addEventListener("focus", refresh);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [loadDashboard, loadEvents, loadIsins, route, runActive]);

  const saveIsin = useCallback(async (body: { isin: string; bond_name: string }) => {
    try {
      if (editingIsin) {
        await api.updateIsin(editingIsin.isin, { bond_name: body.bond_name });
        notify(`ISIN ${editingIsin.isin} edited`);
      } else {
        await api.addIsin(body);
        notify(`ISIN ${body.isin.toUpperCase()} added`);
      }
      setEditOpen(false);
      setEditingIsin(null);
      await loadIsins();
      await loadEvents();
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Unable to save ISIN.";
      notify(message, "error");
      setError(message);
    }
  }, [editingIsin, loadEvents, loadIsins, notify]);

  const importIsinRows = useCallback(async (rows: Array<{ isin: string; bond_name: string }>) => {
    try {
      const result = await api.importIsins(rows);
      notify(`${result.imported} ISINs imported`);
      setImportOpen(false);
      await loadIsins();
      await loadEvents();
    } catch (importError) {
      const message = importError instanceof Error ? importError.message : "Unable to import ISINs.";
      notify(message, "error");
      setError(message);
    }
  }, [loadEvents, loadIsins, notify]);

  const deleteIsin = useCallback(async (isin: string) => {
    await api.deleteIsin(isin);
    notify(`ISIN ${isin} deleted`);
    await loadIsins();
    await loadDeletedIsins();
    await loadEvents();
  }, [loadDeletedIsins, loadEvents, loadIsins, notify]);

  const restoreIsin = useCallback(async (isin: string) => {
    await api.restoreIsin(isin);
    notify(`ISIN ${isin} restored`);
    await loadIsins();
    await loadDeletedIsins();
    await loadEvents();
  }, [loadDeletedIsins, loadEvents, loadIsins, notify]);

  const saveSettings = useCallback(async (patch: Partial<Settings>) => {
    setSettings(await api.saveSettings(patch));
    notify("Operations settings updated");
    await loadEvents();
  }, [loadEvents, notify]);

  const updateThemeMode = useCallback((mode: ThemeMode) => {
    setCookie(THEME_COOKIE_KEY, mode);
    applyThemeMode(mode);
    setThemeMode(mode);
  }, []);

  const saveUserSettings = useCallback(async (patch: Partial<UserSettings>) => {
    setUserSettings((current) => current ? { ...current, ...patch } : current);
    const saved = await api.saveUserSettings(patch);
    setUserSettings(saved);
    notify("User settings updated");
    await loadEvents();
  }, [loadEvents, notify]);

  const startManualRun = useCallback(async () => {
    if (manualRunPending) return;
    setManualRunPending(true);

    try {
      const decision = await api.startRun();

      if (!decision.allowed) {
        sonnerToast.warning(<ManualRunDeniedToast decision={decision} />, {
          duration: decision.reason === "active_run" ? 5000 : Math.min(Math.max(decision.seconds_until_next * 1000, 5000), 30000),
        });
        await loadDashboard();
        return;
      }

      sonnerToast.success("Manual run started", {
        description: `${decision.total_isins} ISINs queued. ${decision.remaining_today}/${decision.manual_refresh_limit} manual runs left today.`,
      });
      await loadDashboard();
      await loadEvents();
    } catch (runError) {
      const message = runError instanceof Error ? runError.message : "Unable to start manual run.";
      sonnerToast.error(message);
      setError(message);
    } finally {
      setManualRunPending(false);
    }
  }, [loadDashboard, loadEvents, manualRunPending]);

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
    <div className="min-h-screen bg-stone-100 text-stone-950 dark:bg-stone-950 dark:text-stone-50">
      <aside className="fixed inset-y-0 left-0 hidden w-20 xl:w-64 flex-col bg-stone-50 px-2 xl:px-4 py-5 shadow-sm dark:bg-stone-900 lg:flex z-20 transition-all duration-300">
        <div className="mb-8 flex flex-col xl:flex-row items-center xl:justify-between px-2">
          <div className="flex items-center justify-center w-full xl:w-auto xl:justify-start gap-2">
            <span className="xl:hidden relative flex h-3 w-3 my-1">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-system opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-system"></span>
            </span>
            <div className="hidden xl:block">
              <div className="font-bold tracking-tight text-stone-900 dark:text-stone-50 text-base flex items-center gap-2">
                Consulenza360
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-system opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-system"></span>
                </span>
              </div>
              <div className="text-xs text-stone-550 dark:text-stone-400 mt-0.5">EuroTLX ISIN checks</div>
            </div>
          </div>
        </div>
        <nav className="space-y-1 flex flex-col items-center xl:items-stretch">
          <Button
            className="w-9 xl:w-full justify-center xl:justify-start rounded-full px-0 xl:px-4 flex-shrink-0"
            variant={route === "/" ? "default" : "ghost"}
            onClick={() => navigate("/")}
            title="Dashboard"
          >
            <Icon icon={DashboardBrowsingIcon} size={16} />
            <span className="hidden xl:inline">Dashboard</span>
          </Button>
          <Button
            className="w-9 xl:w-full justify-center xl:justify-start rounded-full px-0 xl:px-4 flex-shrink-0"
            variant={route === "/isin" ? "default" : "ghost"}
            onClick={() => navigate("/isin")}
            title="ISIN List"
          >
            <Icon icon={LeftToRightListNumberIcon} size={16} />
            <span className="hidden xl:inline">ISIN List</span>
          </Button>
          <Button
            className="w-9 xl:w-full justify-center xl:justify-start rounded-full px-0 xl:px-4 flex-shrink-0"
            variant="ghost"
            onClick={() => setSearchOpen(true)}
            title="Search"
          >
            <Icon icon={SearchList02Icon} size={16} />
            <span className="hidden xl:inline">Search</span>
          </Button>
          <Button
            className="w-9 xl:w-full justify-center xl:justify-start rounded-full px-0 xl:px-4 flex-shrink-0"
            variant={route === "/logs" ? "default" : "ghost"}
            onClick={() => navigate("/logs")}
            title="Logs"
          >
            <Icon icon={NewsIcon} size={16} />
            <span className="hidden xl:inline">Logs</span>
          </Button>
        </nav>
        <div className="mt-auto space-y-3.5">
          <div className="border-t border-stone-200/50 dark:border-stone-850/60 pt-4 mb-14 w-full flex justify-center">
            <div className="hidden xl:flex justify-center w-full">
              <ThemeModeControl value={themeMode} onChange={updateThemeMode} />
            </div>
            <div className="xl:hidden flex justify-center w-full">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full text-stone-500 hover:text-cyan-500"
                onClick={() => {
                  const modes: ThemeMode[] = ["light", "dark", "device"];
                  const nextIndex = (modes.indexOf(themeMode) + 1) % modes.length;
                  updateThemeMode(modes[nextIndex]);
                }}
                title={`Theme: ${themeMode} (click to change)`}
              >
                <Icon
                  icon={
                    themeMode === "light"
                      ? Sun01Icon
                      : themeMode === "dark"
                        ? Moon02Icon
                        : LaptopIcon
                  }
                  size={16}
                />
              </Button>
            </div>
          </div>
          <div className="space-y-1 flex flex-col items-center xl:items-stretch">
            {identity?.authenticated ? (
              <Button
                className="w-9 xl:w-full justify-center xl:justify-start rounded-full px-0 xl:px-4 flex-shrink-0"
                variant="ghost"
                onClick={() => setSettingsOpen(true)}
                title="Settings"
              >
                <Icon icon={Settings05Icon} size={16} />
                <span className="hidden xl:inline">Settings</span>
              </Button>
            ) : null}
            {identity?.authenticated ? (
              <Button asChild className="w-9 xl:w-full justify-center xl:justify-start rounded-full px-0 xl:px-4 flex-shrink-0" variant="ghost">
                <a href="/cdn-cgi/access/logout" title="Log out">
                  <Icon icon={Logout01Icon} size={16} />
                  <span className="hidden xl:inline">Log out</span>
                </a>
              </Button>
            ) : (
              <Button asChild className="w-9 xl:w-full justify-center xl:justify-start rounded-full px-0 xl:px-4 flex-shrink-0" variant="ghost">
                <a href="/" title="Log in">
                  <Icon icon={Login01Icon} size={16} />
                  <span className="hidden xl:inline">Log in</span>
                </a>
              </Button>
            )}
          </div>
        </div>
      </aside>

      <main className="lg:pl-20 xl:pl-64 transition-all duration-300">
        <header className="sticky top-0 z-10 bg-white/65 px-4 py-3.5 backdrop-blur-md dark:bg-stone-950/70 sm:px-6 shadow-sm shadow-stone-900/5 dark:shadow-black/10">
          <div className="flex flex-row flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-stone-900 dark:text-stone-50">EuroTLX ISIN Dashboard</h1>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">Presence monitoring for the imported bond universe.</p>
            </div>

            <div className="flex flex-wrap items-center gap-5 text-right ml-auto">
              {/* Sync Status (page automatic refresh status) */}
              <div className="flex flex-col items-end gap-0.5">
                <span className="text-[10px] uppercase tracking-wider text-stone-455 dark:text-stone-500 font-semibold">Sync Status</span>
                <div className="flex items-center gap-1.5">
                  {runActive ? (
                    <span className="h-2 w-2 animate-pulse rounded-full bg-system" />
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-stone-400 dark:bg-stone-600" />
                  )}
                  <span className="font-mono text-xs text-stone-600 dark:text-stone-300">
                    {formatTime(lastSyncedAt)}
                  </span>
                </div>
              </div>

              {/* Vertical divider line */}
              <div className="hidden sm:block h-7 w-px bg-stone-200 dark:bg-stone-800" />

              {/* Last Run outcome & manual trigger */}
              <div className="flex items-center gap-3">
                {latestRun ? (
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="text-[10px] uppercase tracking-wider text-stone-450 dark:text-stone-500 font-semibold">Last Run</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-medium text-stone-700 dark:text-stone-300">
                        {latestRun.started_at ? formatDateTime(latestRun.started_at) : "Never"}
                      </span>
                      <Badge variant={
                        latestRun.status === "completed"
                          ? "present"
                          : latestRun.status === "blocked" || latestRun.status === "failed"
                            ? "error"
                            : latestRun.status === "pending" || latestRun.status === "processing"
                              ? "cyan"
                              : "absent"
                      }>
                        {latestRun.status}
                      </Badge>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="text-[10px] uppercase tracking-wider text-stone-450 dark:text-stone-500 font-semibold">Last Run</span>
                    <span className="text-xs font-mono font-medium text-stone-500">Never executed</span>
                  </div>
                )}

                <Button
                  size="sm"
                  variant="secondary"
                  disabled={manualRunPending}
                  onClick={startManualRun}
                  className="rounded-full shadow-inner hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 duration-200 transition-all gap-1.5 h-8 text-xs font-semibold px-3"
                >
                  <Icon icon={ArrowReloadHorizontalIcon} size={13} className={cn((runActive || manualRunPending) && "animate-spin text-system")} />
                  <span>{runActive ? "Scanning..." : manualRunPending ? "Starting..." : "Run Check"}</span>
                </Button>
              </div>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
          {error ? (
            <div className="rounded-xl border border-rose-200/80 bg-rose-50/80 p-3 text-sm text-rose-700 shadow-sm dark:border-rose-900/80 dark:bg-rose-950/50 dark:text-rose-300">
              {error}
            </div>
          ) : null}

          {route === "/" ? (
            <>
              <section className="grid gap-2 sm:gap-4 grid-cols-3">
                <MetricCard
                  label="Active ISINs"
                  value={summary?.active_isins ?? 0}
                  detail="Total universe in database"
                  accentColor="system"
                />
                <MetricCard
                  label="Present"
                  value={latestRun?.present_count ?? 0}
                  detail="Successfully found on EuroTLX"
                  accentColor="present"
                />
                <MetricCard
                  label="Absent"
                  value={latestRun?.absent_count ?? 0}
                  detail={
                    <>
                      Not found or unchecked
                      {latestRun?.error_count ? (
                        <span className="ml-1 text-rose-500 font-semibold">({latestRun.error_count} errors)</span>
                      ) : null}
                    </>
                  }
                  accentColor="absent"
                />
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
                onDelete={deleteIsin}
              />
            </>
          ) : null}

          {route === "/isin" ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">ISIN List</h2>
                  <p className="text-sm text-stone-500">Manage active and deleted instruments.</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setImportOpen(true)}><Icon icon={Upload01Icon} size={16} />Batch</Button>
                  <Button onClick={() => { setEditingIsin(null); setEditOpen(true); }}><Icon icon={Add01Icon} size={16} />Add</Button>
                </div>
              </div>
              <IsinList
                data={isins}
                query={query}
                status={status}
                sorting={sorting}
                title="Active ISINs"
                management
                onQuery={setQuery}
                onStatus={setStatus}
                onSorting={setSorting}
                onEdit={(row) => { setEditingIsin(row); setEditOpen(true); }}
                onDelete={deleteIsin}
              />
              <IsinList
                data={deletedIsins}
                query=""
                status="all"
                sorting={sorting}
                title="Deleted ISINs"
                description="Soft-deleted instruments can be restored."
                management
                onQuery={() => undefined}
                onStatus={() => undefined}
                onSorting={setSorting}
                onRestore={restoreIsin}
              />
            </div>
          ) : null}

          {route === "/logs" ? <LogsPage events={events} runLogs={runLogs} /> : null}
        </div>
      </main>
      <SearchDialog open={searchOpen} query={query} data={isins} onOpenChange={setSearchOpen} onQuery={setQuery} />
      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        userSettings={userSettings}
        themeMode={themeMode}
        activeTab={settingsTab}
        onOpenChange={setSettingsOpen}
        onTab={setSettingsTab}
        onSaveSettings={saveSettings}
        onSaveUserSettings={saveUserSettings}
        onManualRun={startManualRun}
        onChangeThemeMode={updateThemeMode}
      />
      <AddEditIsinDialog open={editOpen} row={editingIsin} onOpenChange={setEditOpen} onSave={saveIsin} />
      <ImportIsinsDialog open={importOpen} onOpenChange={setImportOpen} onImport={importIsinRows} />
      {toast ? (
        <div className="fixed right-4 top-4 z-50 max-w-sm rounded-2xl border border-stone-200/80 bg-white px-4 py-3 text-sm shadow-xl dark:border-stone-800/80 dark:bg-stone-950 sm:right-4 sm:top-4 max-sm:left-1/2 max-sm:right-auto max-sm:top-4 max-sm:-translate-x-1/2">
          {toast.message}
        </div>
      ) : null}
      <Toaster richColors position="top-right" theme={document.documentElement.classList.contains("dark") ? "dark" : "light"} />
    </div>
  );
}
