import { syncAgentsToActiveHuddle } from "@/shared/api/tauriChannels";
import { getIdentity } from "@/shared/api/tauriIdentity";
import {
  getRelayHttpUrl,
  getChannelMembers,
  listManagedAgents,
} from "@/shared/api/tauri";
import { listPersonas } from "@/shared/api/tauriPersonas";
import {
  applyReusableAgentAccessPolicy,
  attachManagedAgentToChannel,
} from "@/features/agents/channelAgents";
import type { ManagedAgent } from "@/shared/api/types";
import type { OutboxRecord } from "./types";

/** Replay the existing agent-readiness flow after durable queue acceptance. */
export async function prepareOutboxAgents(row: OutboxRecord): Promise<void> {
  if (!row.agentPubkeys?.length) return;
  const scope = {
    expectedRelayUrl: row.message.relayUrl,
    expectedSignerPubkey: row.message.signerPubkey,
  };
  const current = async () => {
    const [relay, identity] = await Promise.all([
      getRelayHttpUrl(),
      getIdentity(),
    ]);
    if (
      relay.replace(/\/+$/, "") !== row.message.relayUrl.replace(/\/+$/, "") ||
      identity.pubkey !== row.message.signerPubkey
    )
      throw new Error("Community changed; agent preparation is queued.");
  };
  await current();
  const [members, agents, personas] = await Promise.all([
    getChannelMembers(row.message.channelId, { readYourWrites: true }),
    listManagedAgents(),
    listPersonas(),
  ]);
  await current();
  const memberKeys = new Set(members.map((member) => member.pubkey));
  const wake = (agent: ManagedAgent) => {
    const previous = row.wakes?.find(
      (pending) => pending.pubkey === agent.pubkey,
    );
    if (!previous) {
      row.wakes ??= [];
      row.wakes.push({
        pubkey: agent.pubkey,
        replayFloorUnix: row.intendedAt,
      });
    }
  };
  for (const pubkey of row.agentPubkeys) {
    const agent = agents.find((candidate) => candidate.pubkey === pubkey);
    if (!agent) continue;
    await current();
    let ready = agent;
    if (!memberKeys.has(pubkey)) {
      if (row.message.channel?.channelType === "dm")
        throw new Error(
          "Agent is no longer a participant in this DM. Edit the queued message.",
        );
      ready = (
        await applyReusableAgentAccessPolicy(
          agent,
          {},
          personas.find((persona) => persona.id === agent.personaId),
          scope,
        )
      ).agent;
      await current();
      await attachManagedAgentToChannel(row.message.channelId, {
        agent: ready,
        role: "bot",
        ...scope,
        detachedStart: wake,
      });
      await current();
    }
    const running =
      ready.backend.type === "provider"
        ? ready.status === "deployed"
        : ready.status === "running" || ready.status === "deployed";
    if (!running) wake(ready);
  }
  await current();
  await syncAgentsToActiveHuddle(
    row.message.channelId,
    row.agentPubkeys,
    scope,
  );
  await current();
}
