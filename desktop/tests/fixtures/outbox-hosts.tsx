import {
  outboxSnapshot,
  outboxError,
} from "@/features/messages/outbox/runtime";
import type * as React from "react";
import { OutboxProvider } from "@/features/messages/outbox/OutboxProvider";
import { emit } from "@tauri-apps/api/event";
import type { RelayEvent } from "@/shared/api/types";

const params = new URLSearchParams(location.search);
const enabled = params.has("outbox");
const relay = params.get("outboxRelay");
const internals = window as unknown as {
  __TAURI_INTERNALS__: {
    invoke: (
      command: string,
      args?: Record<string, unknown> | Uint8Array,
      options?: { headers?: Record<string, string> },
    ) => Promise<unknown>;
  };
};

/** Only external native I/O is replaced; the composer, queue and IDB are real. */
export function installOutboxFixture(): void {
  if (!enabled || !relay) return;
  const exposed = window as unknown as {
    outboxFixtureSnapshot: typeof outboxSnapshot;
    outboxFixtureError: typeof outboxError;
  };
  exposed.outboxFixtureSnapshot = outboxSnapshot;
  exposed.outboxFixtureError = outboxError;
  const original = internals.__TAURI_INTERNALS__.invoke;
  internals.__TAURI_INTERNALS__.invoke = async (command, rawArgs, options) => {
    const args = rawArgs as Record<string, unknown>;
    if (
      [
        "send_channel_message",
        "publish_queued_message",
        "find_queued_message",
      ].includes(command)
    ) {
      const debug = window as unknown as { outboxFixtureLog?: unknown[] };
      debug.outboxFixtureLog ??= [];
      debug.outboxFixtureLog.push({ command, args });
    }
    if (command === "get_relay_http_url") return "http://localhost:3000";
    if (command === "upload_media_bytes_raw") {
      const decode = (value: string) =>
        atob(value.replaceAll("-", "+").replaceAll("_", "/"));
      const progressId = decode(options?.headers?.["x-buzz-progress-id"] ?? "");
      await emit("media-upload-progress", {
        id: progressId,
        sent: 4,
        total: 10,
      });
      const response = await fetch(`${relay}/upload`, {
        method: "POST",
        body: rawArgs as Uint8Array<ArrayBuffer>,
      });
      if (!response.ok) throw new Error("offline during attachment upload");
      return response.json();
    }
    if (command === "find_queued_message") {
      if (!((args.signedEventIds ?? []) as string[]).length) return null;
      const response = await fetch(
        `${relay}/lookup?id=${encodeURIComponent(String(args.clientMessageId))}`,
      );
      if (!response.ok) throw new Error("relay lookup unavailable");
      const event = await response.json();
      return event ? { event } : null;
    }
    if (command === "send_channel_message" && args.prepareOnly) {
      const identity = (await original("get_identity")) as { pubkey: string };
      const count =
        Number(localStorage.getItem("outbox-fixture-signatures") ?? 0) + 1;
      localStorage.setItem("outbox-fixture-signatures", String(count));
      const event: RelayEvent = {
        id: crypto.randomUUID().replaceAll("-", "").padEnd(64, "0"),
        sig: "fixture-signature",
        pubkey: identity.pubkey,
        created_at: Math.floor(Date.now() / 1000),
        kind: 9,
        content: String(args.content),
        tags: [
          ["h", String(args.channelId)],
          ...((args.mentionPubkeys ?? []) as string[]).map((key) => ["p", key]),
          ...(args.parentEventId
            ? [
                [
                  "e",
                  String(args.rootEventId ?? args.parentEventId),
                  "",
                  "root",
                ],
                ["e", String(args.parentEventId), "", "reply"],
              ]
            : []),
          ...((args.mediaTags ?? []) as string[][]),
          ...((args.emojiTags ?? []) as string[][]),
          ...((args.mentionTags ?? []) as string[][]),
          ...((args.linkPreviewTags ?? []) as string[][]),
          ...(args.sentFromThreadTag
            ? [args.sentFromThreadTag as string[]]
            : []),
          ["client_msg_id", String(args.clientMessageId)],
          ["client_written_at", String(args.intendedCreatedAt)],
          ["d", `client_msg_id:${String(args.clientMessageId)}`],
        ],
      };
      return {
        event_id: event.id,
        parent_event_id: args.parentEventId ?? null,
        root_event_id: args.rootEventId ?? null,
        depth: args.parentEventId ? 1 : 0,
        created_at: event.created_at,
        signed_event: event,
      };
    }
    if (command === "publish_queued_message") {
      const response = await fetch(`${relay}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args.event),
      });
      if (!response.ok) throw new Error("relay disconnected");
      return;
    }
    return original(command, rawArgs, options);
  };
}

export function OutboxFixtureProvider({
  children,
  signerPubkey,
}: {
  children: React.ReactNode;
  signerPubkey: string;
}) {
  return enabled ? (
    <OutboxProvider
      relayUrl="http://localhost:3000"
      signerPubkey={signerPubkey}
    >
      {children}
    </OutboxProvider>
  ) : (
    children
  );
}
