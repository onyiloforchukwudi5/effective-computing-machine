import { verifyToken } from "@/lib/crypto";
import { addUnsubscribe } from "@/lib/sequences";

export const dynamic = "force-dynamic";

async function handle(token: string, html: boolean) {
  const t = verifyToken(token);
  if (!t?.u || !t.e) return new Response("Invalid or expired link", { status: 400 });
  await addUnsubscribe(t.u, t.e, "unsubscribe-link");
  return html
    ? new Response(`<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;max-width:480px;margin:60px auto"><h2>You are unsubscribed</h2><p>${t.e.replace(/[<>&]/g, "")} will no longer receive emails from this sender.</p></body>`, { headers: { "content-type": "text/html" } })
    : new Response("ok");
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  return handle((await params).token, true);
}
/** RFC 8058 one-click */
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  return handle((await params).token, false);
}
