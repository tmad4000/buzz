import {
  QUEUE_ROOT,
  QUEUE_SERVER,
  QUEUE_BRIDGE,
  QUEUE_D,
  QUEUE_RECIPIENT,
} from "./model.ts";
export const clock = 1795000000;
export const row = (id = "1".repeat(64)) => ({
  id,
  source: "jacob-dm",
  createdAt: clock - 100,
  preview: "Jacob DM request",
  state: "queued",
  stateObservedAt: clock - 100,
});
export const snapshot = () => ({
  v: 1,
  serverId: QUEUE_SERVER,
  agentId: QUEUE_ROOT,
  observedAt: clock,
  verifiedAt: clock,
  availability: "ok",
  rootState: "running",
  depth: 1,
  oldestCreatedAt: clock - 100,
  items: [row()],
  recent: [],
  omitted: 0,
  complete: true,
});
export const event = (id = "1".repeat(64), at = clock) => ({
  id,
  pubkey: QUEUE_BRIDGE,
  kind: 30078,
  created_at: at,
  tags: [
    ["d", QUEUE_D],
    ["p", QUEUE_RECIPIENT],
  ],
  content: "Ag==",
  sig: "0".repeat(128),
});
export const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};
