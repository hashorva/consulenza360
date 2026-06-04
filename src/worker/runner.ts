import { checkEurotlxIsin } from "./eurotlx";
import { mapWithConcurrency } from "./pool";
import { createSupabase } from "./supabase";
import type { BlockedResult, CheckResult, ClaimedIsin, Env, ManualRunDecision, RunMessage } from "./types";

const BATCH_SIZE = 45;
const FETCH_CONCURRENCY = 4;
const BLOCKED_THRESHOLD = 3;

function isBlockedResult(result: CheckResult | BlockedResult): result is BlockedResult {
  return "kind" in result && result.kind === "blocked";
}

function unwrapRpcRow<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] as T | undefined) ?? null;
  return (value as T | null) ?? null;
}

export async function enqueueRun(env: Env, runId: string, iteration = 1) {
  await env.RUN_QUEUE.send({ run_id: runId, iteration });
}

export async function processRunMessage(env: Env, message: RunMessage) {
  const supabase = createSupabase(env);
  console.log("queue.chunk.start", { run_id: message.run_id, iteration: message.iteration });

  const { data: claimedData, error: claimError } = await supabase.rpc("claim_check_chunk", {
    target_run_id: message.run_id,
    chunk_size: BATCH_SIZE,
  });

  if (claimError) throw claimError;

  const claimed = (claimedData ?? []) as ClaimedIsin[];
  if (claimed.length === 0) {
    const { error: completeEmptyError } = await supabase.rpc("complete_check_chunk", {
      target_run_id: message.run_id,
      results: [],
    });
    if (completeEmptyError) throw completeEmptyError;
    console.log("queue.chunk.empty", { run_id: message.run_id });
    return;
  }

  let blockedCount = 0;
  const results = await mapWithConcurrency(
    claimed,
    FETCH_CONCURRENCY,
    (item) => checkEurotlxIsin(env, item),
    (currentResults) => {
      blockedCount = currentResults.filter(isBlockedResult).length;
      return blockedCount < BLOCKED_THRESHOLD;
    },
  );

  const blocked = results.find(isBlockedResult);
  if (blocked && blockedCount >= BLOCKED_THRESHOLD) {
    const { error: blockedError } = await supabase.rpc("mark_run_blocked", {
      target_run_id: message.run_id,
      reason: blocked.reason,
      metadata: {
        blocked_count: blockedCount,
        sample_isin: blocked.isin,
        status_code: blocked.status_code,
        source_url: blocked.source_url,
      },
    });
    if (blockedError) throw blockedError;
    console.log("queue.run.blocked", { run_id: message.run_id, reason: blocked.reason, blockedCount });
    return;
  }

  const checkResults = results.filter((result): result is CheckResult => !isBlockedResult(result));
  const { data: completeData, error: completeError } = await supabase.rpc("complete_check_chunk", {
    target_run_id: message.run_id,
    results: checkResults,
  });

  if (completeError) throw completeError;

  const completeRow = unwrapRpcRow<{ has_more_work: boolean; run_status: string }>(completeData);
  console.log("queue.chunk.complete", {
    run_id: message.run_id,
    iteration: message.iteration,
    claimed: claimed.length,
    completed: checkResults.length,
    has_more_work: completeRow?.has_more_work,
  });

  if (completeRow?.has_more_work) {
    await enqueueRun(env, message.run_id, message.iteration + 1);
  }
}

export async function runScheduled(env: Env) {
  const supabase = createSupabase(env);
  const { data, error } = await supabase.rpc("maybe_start_due_run", {
    now_utc: new Date().toISOString(),
  });

  if (error) throw error;

  const row = unwrapRpcRow<{ should_enqueue: boolean; run_id: string | null; total_isins: number }>(data);
  if (row?.should_enqueue && row.run_id) {
    await enqueueRun(env, row.run_id, 1);
    console.log("cron.run.enqueued", { run_id: row.run_id, total_isins: row.total_isins });
  } else {
    console.log("cron.run.skipped");
  }
}

export async function startManualRun(env: Env) {
  const supabase = createSupabase(env);
  const { data, error } = await supabase.rpc("start_guarded_manual_run", {
    now_utc: new Date().toISOString(),
  });

  if (error) throw error;
  const row = unwrapRpcRow<ManualRunDecision>(data);
  if (!row) {
    throw new Error("Manual run RPC did not return a decision.");
  }

  if (row.allowed) {
    if (!row.run_id) {
      throw new Error("Manual run RPC allowed the request without returning a run id.");
    }
    await enqueueRun(env, row.run_id, 1);
  }

  return row;
}
