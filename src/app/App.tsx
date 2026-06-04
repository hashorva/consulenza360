import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Add01Icon,
  ArchiveRestoreIcon,
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
import type { AppEventListResponse, DashboardSummary, Identity, IsinListResponse, IsinRow, RunLogs, Settings, UserSettings } from "./types/api";
import { Icon } from "./components/Icon";
import { RunExecutionLog } from "./components/RunExecutionLog";
import { StatusBadge } from "./components/StatusBadge";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "./components/ui/chart";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "./components/ui/dialog";
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

function currentRoute(): AppRoute {
  if (window.location.pathname === "/isin") return "/isin";
  if (window.location.pathname === "/logs") return "/logs";
  return "/";
}

function ThemeModeControl({ value, onChange }: { value: ThemeMode; onChange: (value: ThemeMode) => void }) {
  const options: { value: ThemeMode; label: string; icon: typeof Sun01Icon }[] = [
    { value: "light", label: "Light", icon: Sun01Icon },
    { value: "dark", label: "Dark", icon: Moon02Icon },
    { value: "device", label: "Device", icon: LaptopIcon },
  ];

  return (
    <div className="mx-auto inline-grid grid-cols-3 rounded-full border border-stone-200/70 bg-stone-100/70 p-1 shadow-inner dark:border-stone-800/70 dark:bg-stone-900/65">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={cn(
            "flex h-8 w-9 items-center justify-center rounded-full text-stone-500 transition-all hover:text-stone-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 dark:text-stone-400 dark:hover:text-stone-50",
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
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description ?? <><span className="font-mono">{activeCount}</span> active instruments</>}</CardDescription>
          </div>
          {!management ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant={status === "all" ? "default" : "secondary"} size="sm" onClick={() => onStatus("all")}>All</Button>
              <Button variant={status === "present" ? "default" : "secondary"} size="sm" onClick={() => onStatus("present")}>Present</Button>
              <Button variant={status === "absent" ? "default" : "secondary"} size="sm" onClick={() => onStatus("absent")}>Absent</Button>
              <Button variant={status === "error" ? "default" : "secondary"} size="sm" onClick={() => onStatus("error")}>Error</Button>
            </div>
          ) : null}
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
            {onEdit ? (
              <Button variant="ghost" size="icon" onClick={() => onEdit(row)} aria-label={`Edit ${row.isin}`}>
                <Icon icon={Edit01Icon} size={16} />
              </Button>
            ) : null}
            {onRestore && !row.active ? (
              <Button variant="ghost" size="icon" onClick={() => onRestore(row.isin)} aria-label={`Restore ${row.isin}`}>
                <Icon icon={ArchiveRestoreIcon} size={16} />
              </Button>
            ) : null}
            {onDelete && row.active !== false ? (
              <Button variant="ghost" size="icon" onClick={() => onDelete(row.isin)} aria-label={`Delete ${row.isin}`}>
                <Icon icon={Delete02Icon} size={16} />
              </Button>
            ) : null}
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
          <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-stone-300 bg-[#fbfaf7] text-sm text-stone-500 dark:border-stone-700 dark:bg-stone-950/35">
            <Icon icon={Upload01Icon} size={22} />
            Upload {mode.toUpperCase()} file
            <input className="sr-only" type="file" accept={mode === "csv" ? ".csv,text/csv" : ".xlsx,.xls"} onChange={(event) => event.target.files?.[0] && void readFile(event.target.files[0])} />
          </label>
          {rows.length ? (
            <div className="max-h-52 overflow-y-auto rounded-2xl border border-stone-200/70 dark:border-stone-800/70">
              {rows.slice(0, 80).map((row, index) => (
                <div key={`${row.isin}-${index}`} className="grid grid-cols-[10rem_minmax(0,1fr)] gap-3 border-b border-stone-200/60 px-3 py-2 text-sm last:border-0 dark:border-stone-800/60">
                  <span className="font-mono">{row.isin}</span>
                  <span className={cn("truncate", (!ISIN_PATTERN.test(row.isin) || !row.bond_name) && "text-rose-600")}>{row.bond_name || "Missing bond name"}</span>
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
        <DialogBody className="max-h-[26rem] space-y-2">
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
}) {
  const tabs: Array<{ id: SettingsTab; label: string }> = [
    { id: "general", label: "General" },
    { id: "dashboard", label: "Dashboard" },
    { id: "operations", label: "Operations" },
  ];
  const [runHour, setRunHour] = useState(settings?.run_hour ?? 10);
  const [refreshSeconds, setRefreshSeconds] = useState(userSettings?.dashboard_refresh_seconds ?? 15);

  useEffect(() => {
    if (settings) setRunHour(settings.run_hour);
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
        <div className="grid max-h-[calc(100vh-7rem)] min-h-[32rem] grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[12rem_minmax(0,1fr)] lg:grid-rows-1">
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
          <DialogBody className="space-y-5">
            {activeTab === "general" ? (
              <>
                <section className="space-y-3">
                  <h3 className="font-semibold">Appearance</h3>
                  <div className="flex items-center justify-between gap-4 border-b border-stone-200/70 py-3 dark:border-stone-800/70">
                    <span className="text-sm">User theme preference</span>
                    <ThemeModeControl value={userSettings?.theme_preference ?? "device"} onChange={(theme_preference) => void onSaveUserSettings({ theme_preference })} />
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
            <div key={event.id} className="rounded-2xl border border-stone-200/70 bg-[#fbfaf7] p-3 dark:border-stone-800/70 dark:bg-stone-950/35">
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

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const useDark = themeMode === "dark" || (themeMode === "device" && mediaQuery.matches);
      document.documentElement.classList.toggle("dark", useDark);
      document.documentElement.style.colorScheme = useDark ? "dark" : "light";
    };

    setCookie(THEME_COOKIE_KEY, themeMode);
    applyTheme();
    mediaQuery.addEventListener("change", applyTheme);

    return () => mediaQuery.removeEventListener("change", applyTheme);
  }, [themeMode]);

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

  const saveUserSettings = useCallback(async (patch: Partial<UserSettings>) => {
    setUserSettings(await api.saveUserSettings(patch));
    notify("User settings updated");
    await loadEvents();
  }, [loadEvents, notify]);

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
          <Button className="w-full justify-start rounded-full" variant={route === "/" ? "default" : "ghost"} onClick={() => navigate("/")}>
            <Icon icon={DashboardBrowsingIcon} size={17} />
            Dashboard
          </Button>
          <Button className="w-full justify-start rounded-full" variant={route === "/isin" ? "default" : "ghost"} onClick={() => navigate("/isin")}>
            <Icon icon={LeftToRightListNumberIcon} size={17} />
            ISIN List
          </Button>
          <Button className="w-full justify-start rounded-full" variant="ghost" onClick={() => setSearchOpen(true)}>
            <Icon icon={SearchList02Icon} size={17} />
            Search
          </Button>
          <Button className="w-full justify-start rounded-full" variant={route === "/logs" ? "default" : "ghost"} onClick={() => navigate("/logs")}>
            <Icon icon={NewsIcon} size={17} />
            Logs
          </Button>
          <div className="py-2">
            <ThemeModeControl value={themeMode} onChange={setThemeMode} />
          </div>
          <Button className="w-full justify-start rounded-full" variant="ghost" onClick={() => setSettingsOpen(true)}>
            <Icon icon={Settings05Icon} size={17} />
            Settings
          </Button>
        </nav>
        <div className="absolute bottom-5 left-4 right-4">
          {identity?.authenticated ? (
            <Button asChild className="w-full justify-start rounded-full" variant="ghost">
              <a href="/cdn-cgi/access/logout"><Icon icon={Logout01Icon} size={17} />Log out</a>
            </Button>
          ) : (
            <Button asChild className="w-full justify-start rounded-full" variant="ghost">
              <a href="/"><Icon icon={Login01Icon} size={17} />Log in</a>
            </Button>
          )}
        </div>
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

          {route === "/" ? (
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
        onManualRun={async () => {
          await api.startRun();
          notify("Manual run started");
          await loadDashboard();
          await loadEvents();
        }}
      />
      <AddEditIsinDialog open={editOpen} row={editingIsin} onOpenChange={setEditOpen} onSave={saveIsin} />
      <ImportIsinsDialog open={importOpen} onOpenChange={setImportOpen} onImport={importIsinRows} />
      {toast ? (
        <div className="fixed right-4 top-4 z-[60] max-w-sm rounded-2xl border border-stone-200/80 bg-white px-4 py-3 text-sm shadow-xl dark:border-stone-800/80 dark:bg-stone-950 sm:right-4 sm:top-4 max-sm:left-1/2 max-sm:right-auto max-sm:top-4 max-sm:-translate-x-1/2">
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}
