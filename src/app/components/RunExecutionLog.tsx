import { useEffect, useState } from "react";
import { Notification03Icon } from "@hugeicons/core-free-icons";
import { api } from "../lib/api";
import { cn, formatTime } from "../lib/utils";
import type { RunLogs } from "../types/api";
import { Icon } from "./Icon";

export function RunExecutionLog({ runId, active }: { runId: string; active: boolean }) {
  const [logs, setLogs] = useState<RunLogs | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId || !active) return;

    let cancelled = false;
    const load = async () => {
      try {
        const data = await api.runLogs(runId);
        if (!cancelled) {
          setLogs(data);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load run logs.");
      }
    };

    void load();
    const interval = window.setInterval(load, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [runId, active]);

  const summary = logs?.summary ?? { completed: 0, errored: 0, total: 0, processing: 0, pending: 0 };
  return (
    <section className="rounded-2xl border border-stone-800/90 bg-stone-950 p-4.5 font-mono text-xs text-stone-300 shadow-xl shadow-stone-950/20">
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3 border-b border-stone-900 pb-2.5">
        <div className="flex items-center gap-2 text-stone-400">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
          </span>
          <span className="font-semibold tracking-wider text-[10px] text-cyan-400">LIVE SCAN MONITOR</span>
        </div>
        <div className="flex flex-wrap gap-4 text-[10px] text-stone-400">
          <span>
            Present: <strong className="text-emerald-400 font-semibold">{summary.completed}</strong>
          </span>
          <span>
            Absent: <strong className="text-slate-400 font-semibold">{summary.total - summary.completed - summary.errored - summary.processing - summary.pending}</strong>
          </span>
          <span>
            Errors: <strong className="text-rose-400 font-semibold">{summary.errored}</strong>
          </span>
          <span>
            Progress:{" "}
            <strong className="text-stone-200">
              {summary.completed + summary.errored}/{summary.total}
            </strong>
          </span>
        </div>
      </div>

      <div className="h-48 space-y-1.5 overflow-y-auto scrollbar-thin scrollbar-thumb-stone-800 scrollbar-track-transparent">
        {error ? <div className="text-rose-350">{error}</div> : null}
        {!logs && !error ? <div className="text-stone-600">Initializing queue runner...</div> : null}
        {logs?.processingItems.map((item) => (
          <div key={`processing-${item.isin}`} className="flex items-center gap-2.5 border-b border-stone-900/40 pb-1.5 last:border-0">
            <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-stone-650">[{formatTime(item.claimed_at)}]</span>
            <span className="font-semibold text-stone-100">{item.isin}</span>
            <span className="truncate text-stone-400 max-w-[200px] md:max-w-xs">{item.bond_name}</span>
            <span className="ml-auto text-[10px] uppercase font-semibold text-cyan-400 animate-pulse">processing</span>
          </div>
        ))}
        {logs?.recentChecks.map((log) => (
          <div key={`${log.isin}-${log.checked_at}`} className="flex items-center gap-2.5 border-b border-stone-900/40 pb-1.5 last:border-0">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                log.status === "present"
                  ? "bg-emerald-400"
                  : log.status === "error"
                    ? "bg-rose-400"
                    : "bg-slate-500"
              )}
            />
            <span className="text-stone-655 text-stone-500">[{formatTime(log.checked_at)}]</span>
            <span className="font-semibold text-stone-200">{log.isin}</span>
            <span className="max-w-[150px] md:max-w-xs truncate text-stone-400">{log.bond_name}</span>
            <span className={cn(
              "ml-auto text-right font-medium",
              log.status === "present" && "text-emerald-400",
              log.status === "error" && "text-rose-400",
              log.status === "absent" && "text-slate-400",
            )}>
              {log.status === "error" ? log.error_message || "Fetch failed" : `${log.response_time ?? 0}ms`}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
