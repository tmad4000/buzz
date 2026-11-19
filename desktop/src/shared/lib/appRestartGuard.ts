type RestartGuard = () => boolean;
const guards = new Set<{ guard: RestartGuard }>();
let revision = 0;

/** Restart leaves every pane, including mounted panes that are not focused. */
export function registerAppRestartGuard(guard: RestartGuard): () => void {
  const registration = { guard };
  guards.add(registration);
  revision++;
  return () => {
    if (guards.delete(registration)) revision++;
  };
}

export function allowAppRestart(): boolean {
  const before = revision;
  try {
    for (const { guard } of [...guards]) {
      if (guard() !== true) return false;
    }
    return revision === before;
  } catch {
    return false;
  }
}
