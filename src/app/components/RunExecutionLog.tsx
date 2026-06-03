import { useEffect, useState } from "react";
import { Notification03Icon } from "@hugeicons/core-free-icons";
import { api } from "../lib/api";
import { formatTime } from "../lib/utils";
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
    <section className="rounded-xl border border-stone-800/90 bg-stone-950 p-4 font-mono text-xs text-stone-300 shadow-[0_12px_34px_rgba(28,25,23,0.16)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-stone-800 pb-2">
        <div className="flex items-center gap-2 text-stone-400">
          <Icon icon={Notification03Icon} className="text-cyan-400" size={16} />
          <span>LIVE RUN STREAM</span>
        </div>
        <div className="flex flex-wrap gap-3 text-stone-400">
          <span>
            Done: <strong className="text-emerald-400">{summary.completed}</strong>
          </span>
          <span>
            Errors: <strong className="text-rose-400">{summary.errored}</strong>
          </span>
          <span>
            Progress:{" "}
            <strong>
              {summary.completed + summary.errored}/{summary.total}
            </strong>
          </span>
        </div>
      </div>

      <div className="h-48 space-y-1.5 overflow-y-auto">
        {error ? <div className="text-rose-300">{error}</div> : null}
        {!logs && !error ? <div className="text-stone-500">Initializing queue runner...</div> : null}
        {logs?.processingItems.map((item) => (
          <div key={`processing-${item.isin}`} className="flex items-center gap-2 border-b border-stone-900/80 pb-1">
            <span className="h-2 w-2 rounded-full bg-cyan-400" />
            <span className="text-stone-500">[{formatTime(item.claimed_at)}]</span>
            <span className="font-semibold text-stone-100">{item.isin}</span>
            <span className="truncate text-stone-400">{item.bond_name}</span>
            <span className="ml-auto text-cyan-300">processing</span>
          </div>
        ))}
        {logs?.recentChecks.map((log) => (
          <div key={`${log.isin}-${log.checked_at}`} className="flex items-center gap-2 border-b border-stone-900/80 pb-1">
            <span
              className={
                log.status === "present"
                  ? "h-2 w-2 rounded-full bg-emerald-400"
                  : log.status === "error"
                    ? "h-2 w-2 rounded-full bg-rose-400"
                    : "h-2 w-2 rounded-full bg-stone-500"
              }
            />
            <span className="text-stone-500">[{formatTime(log.checked_at)}]</span>
            <span className="font-semibold text-stone-100">{log.isin}</span>
            <span className="max-w-[18rem] truncate text-stone-400">{log.bond_name}</span>
            <span className="ml-auto text-right text-stone-500">
              {log.status === "error" ? log.error_message || "Fetch failed" : `${log.response_time ?? 0}ms`}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
