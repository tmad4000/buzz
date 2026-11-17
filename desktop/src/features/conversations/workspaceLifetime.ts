export type WorkspaceLease<Config> = {
  isCurrent: () => boolean;
  config: () => Config | null;
};
type Disposable = { flush?: () => void; dispose: () => void };
type Entry<Config, Value> = {
  key: string;
  config: Config;
  active: boolean;
  value: Value | null;
};

/** Commit-scoped ownership: flush the old namespace before invalidating its callbacks. */
export class WorkspaceLifetime<Config, Value extends Disposable> {
  private entry: Entry<Config, Value> | null = null;
  private changing = false;

  commit(
    key: string | null,
    config: Config | null,
    create: (lease: WorkspaceLease<Config>) => Value,
  ): Value | null {
    if (this.changing)
      throw new Error("Reentrant conversation workspace transition");
    if (key && config && this.entry?.key === key) {
      this.entry.config = config;
      return this.entry.value;
    }
    this.changing = true;
    try {
      const previous = this.entry;
      if (previous) {
        try {
          previous.value?.flush?.();
        } finally {
          previous.active = false;
          this.entry = null;
          previous.value?.dispose();
        }
      }
      if (!key || !config) return null;
      const entry: Entry<Config, Value> = {
        key,
        config,
        active: true,
        value: null,
      };
      this.entry = entry;
      const lease: WorkspaceLease<Config> = {
        isCurrent: () => this.entry === entry && entry.active,
        config: () =>
          this.entry === entry && entry.active ? entry.config : null,
      };
      try {
        entry.value = create(lease);
        return entry.value;
      } catch (error) {
        entry.active = false;
        this.entry = null;
        throw error;
      }
    } finally {
      this.changing = false;
    }
  }

  clear() {
    this.commit(null, null, () => {
      throw new Error("Unexpected empty workspace factory");
    });
  }
}
