import { createContext, useContext, type ReactNode } from "react";
import { useUpdater } from "./use-updater";

type UpdaterContextValue = ReturnType<typeof useUpdater>;

const UpdaterContext = createContext<UpdaterContextValue | null>(null);

export function UpdaterProvider({ children }: { children: ReactNode }) {
  const updater = useUpdater();
  return <UpdaterContext value={updater}>{children}</UpdaterContext>;
}

/** Settings provenance may also render in isolated settings hosts. */
export function useOptionalUpdaterContext() {
  return useContext(UpdaterContext);
}

export function useUpdaterContext(): UpdaterContextValue {
  const ctx = useContext(UpdaterContext);
  if (!ctx) {
    throw new Error("useUpdaterContext must be used within an UpdaterProvider");
  }
  return ctx;
}
