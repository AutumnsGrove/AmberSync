import type { MiddlewareHandler } from "hono";
import type { Env } from "../types";

export function auth(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    const key = c.req.header("X-Sync-Key");
    if (!key || key !== c.env.SYNC_API_KEY) {
      return c.json({ error: "unauthorized" }, 401);
    }
    await next();
  };
}
