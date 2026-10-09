import type { Message } from "@prisma/client";

/**
 * Internal hook point: fires once per NEW incoming Inbox message stored by sync
 * (never during the initial historical backfill). Subscribe from worker/index.ts.
 */
export type NewInboxMessage = Message & { userId: string };
type Handler = (m: NewInboxMessage) => Promise<void> | void;

const handlers: Handler[] = [];
export function onNewInboxMessage(h: Handler) {
  handlers.push(h);
}
export async function emitNewInboxMessage(m: NewInboxMessage) {
  for (const h of handlers) {
    try {
      await h(m);
    } catch (e) {
      console.error("newInboxMessage handler failed:", e instanceof Error ? e.message : "unknown");
    }
  }
}
