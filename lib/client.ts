"use client";

export async function api<T = Record<string, unknown>>(path: string, method = "GET", body?: unknown): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> {
  const r = await fetch(path, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}
