import { handleApi } from "./worker/api";
import { errorResponse } from "./worker/http";
import { processRunMessage, runScheduled } from "./worker/runner";
import type { Env, RunMessage } from "./worker/types";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env);
      } catch (error) {
        return errorResponse(error);
      }
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runScheduled(env));
  },

  async queue(batch: MessageBatch<RunMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      await processRunMessage(env, message.body);
    }
  },
} satisfies ExportedHandler<Env, RunMessage>;
