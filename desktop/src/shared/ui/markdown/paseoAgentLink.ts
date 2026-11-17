/** Only Paseo's canonical agent-session route may bypass Markdown sanitizing. */
export function isPaseoAgentLink(value: string): boolean {
  return (
    !/\s/.test(value) &&
    /^paseo:\/\/h\/srv_[A-Za-z0-9_-]{6,128}\/agent\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      value,
    )
  );
}
