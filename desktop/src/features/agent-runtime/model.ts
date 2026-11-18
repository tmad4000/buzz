import { verifyEvent } from "nostr-tools/pure";
import type { RelayEvent } from "@/shared/api/types";

export const AGENT_RUNTIME_KIND = 30078;
export const AGENT_RUNTIME_D_TAG = "agent-runtime";
const HOST_SERVERS = {
  gcp: "srv_KIFHQ_zsBnI2",
  m4: "srv_uvq8mbWTDr9Y",
  m5: "srv_xmGYpGqxNnXR",
} as const;
export type RuntimeSession = { serverId: string; agentId: string };
export type AgentRuntimeCard = {
  host: keyof typeof HOST_SERVERS;
  runtime?: string;
  session?: RuntimeSession;
  resume?: { label: string; command: string }[];
  logs?: string;
  delegates?: (RuntimeSession & { label: string })[];
  updatedAt?: number;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max = 256): v is string =>
  typeof v === "string" &&
  v.length > 0 &&
  v.length <= max &&
  !Array.from(v).some((c) => {
    const n = c.charCodeAt(0);
    return (n < 32 && n !== 9 && n !== 10) || n === 127;
  });

/** Only paired, reviewed Paseo servers and canonical session routes are admitted. */
export function runtimeSessionLink(session: RuntimeSession): string | null {
  return Object.values(HOST_SERVERS).includes(
    session.serverId as typeof HOST_SERVERS.gcp,
  ) && uuid.test(session.agentId)
    ? `paseo://h/${session.serverId}/agent/${session.agentId}`
    : null;
}
function session(v: unknown): v is RuntimeSession {
  return (
    record(v) &&
    typeof v.serverId === "string" &&
    typeof v.agentId === "string" &&
    runtimeSessionLink(v as RuntimeSession) !== null
  );
}

/** Validate bounded, self-attested data; commands remain inert clipboard text. */
export function parseRuntimeContent(content: string): AgentRuntimeCard | null {
  if (content.length > 16_384) return null;
  try {
    const c: unknown = JSON.parse(content);
    if (!record(c) || !Object.hasOwn(HOST_SERVERS, String(c.host))) return null;
    if (c.runtime !== undefined && !text(c.runtime)) return null;
    if (c.logs !== undefined && !text(c.logs, 1024)) return null;
    if (
      c.session !== undefined &&
      (!session(c.session) ||
        c.session.serverId !==
          HOST_SERVERS[c.host as keyof typeof HOST_SERVERS])
    )
      return null;
    if (
      c.resume !== undefined &&
      (!Array.isArray(c.resume) ||
        c.resume.length > 8 ||
        !c.resume.every(
          (r) => record(r) && text(r.label, 80) && text(r.command, 2048),
        ))
    )
      return null;
    if (
      c.delegates !== undefined &&
      (!Array.isArray(c.delegates) ||
        c.delegates.length > 16 ||
        !c.delegates.every((d) => record(d) && text(d.label, 80) && session(d)))
    )
      return null;
    if (
      c.updatedAt !== undefined &&
      (!Number.isSafeInteger(c.updatedAt) || Number(c.updatedAt) < 0)
    )
      return null;
    return c as AgentRuntimeCard;
  } catch {
    return null;
  }
}

/** Exact author, coordinate and signature checks; relay actor tags confer no authority. */
export function selectRuntimeCard(
  events: RelayEvent[],
  agentPubkey: string,
  now = Math.floor(Date.now() / 1000),
) {
  const latest = events
    .filter(
      (e) =>
        e.pubkey === agentPubkey &&
        e.kind === AGENT_RUNTIME_KIND &&
        e.created_at <= now + 60 &&
        e.tags.filter((t) => t[0] === "d").length === 1 &&
        e.tags.some(
          (t) => t.length === 2 && t[0] === "d" && t[1] === AGENT_RUNTIME_D_TAG,
        ),
    )
    .filter((e) => {
      try {
        return verifyEvent({
          id: e.id,
          pubkey: e.pubkey,
          kind: e.kind,
          created_at: e.created_at,
          tags: e.tags,
          content: e.content,
          sig: e.sig,
        });
      } catch {
        return false;
      }
    })
    .sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id))[0];
  if (!latest) return null;
  const card = parseRuntimeContent(latest.content);
  if (
    !card ||
    (card.updatedAt !== undefined && card.updatedAt > latest.created_at + 60)
  )
    return null;
  return {
    card,
    attestedAt: Math.min(
      card.updatedAt ?? latest.created_at,
      latest.created_at,
    ),
    eventId: latest.id,
  };
}

/** Agent-key writers can sign this template using their existing signer, then publish it. */
export function runtimeCardTemplate(
  card: AgentRuntimeCard,
  createdAt = Math.floor(Date.now() / 1000),
) {
  const content = JSON.stringify(card);
  if (!parseRuntimeContent(content))
    throw new Error("Invalid agent runtime card");
  return {
    kind: AGENT_RUNTIME_KIND,
    created_at: createdAt,
    tags: [["d", AGENT_RUNTIME_D_TAG]],
    content,
  };
}
