const SERVERS = new Set([
  "srv_KIFHQ_zsBnI2",
  "srv_uvq8mbWTDr9Y",
  "srv_xmGYpGqxNnXR",
]);
/** Only the reviewed agent-session coordinate; never settings, actions, queries or arbitrary apps. */
export function paseoAgentTarget(href: string) {
  if (/\s/.test(href)) return null;
  const match =
    /^paseo(?:-fork)?:\/\/h\/(srv_[A-Za-z0-9_-]{6,128})\/agent\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.exec(
      href,
    );
  if (!match) return null;
  const [, serverId, agentId] = match;
  return {
    serverId,
    agentId,
    nativeUrl: SERVERS.has(serverId)
      ? `paseo-fork://h/${serverId}/agent/${agentId}`
      : null,
  };
}
