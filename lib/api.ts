import { NextResponse } from "next/server";
import { ZodError, ZodSchema } from "zod";
import { currentUser, SessionUser } from "./auth";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

type Ctx<P> = { params: Promise<P> };

/** Wraps a route handler: requires auth, maps errors to JSON without leaking internals. */
export function authed<P = Record<string, string>>(
  fn: (req: Request, user: SessionUser, params: P) => Promise<Response>,
) {
  return async (req: Request, ctx: Ctx<P>) => {
    const user = await currentUser();
    if (!user) return fail("Unauthorized", 401);
    try {
      return await fn(req, user, await ctx.params);
    } catch (e) {
      if (e instanceof ZodError) return fail(e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
      if (e instanceof HttpError) return fail(e.message, e.status);
      console.error("route error", e instanceof Error ? e.message : "unknown");
      return fail("Internal error", 500);
    }
  };
}

export class HttpError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export async function body<T>(req: Request, schema: ZodSchema<T>): Promise<T> {
  return schema.parse(await req.json());
}

import { AiConfigError, AiLimitError } from "./ai";
/** Maps AI errors to clear client messages. Returns null if not an AI error. */
export function aiErrorResponse(e: unknown): Response | null {
  if (e instanceof AiLimitError) return fail(e.message, 429);
  if (e instanceof AiConfigError) return fail(e.message, 400);
  if (e instanceof Error && e.message.startsWith("AI provider error")) return fail(e.message, 502);
  return null;
}
