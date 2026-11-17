import { createContext, useContext } from "react";

export type PaseoHostHealth = { offlineSince: number | null };
export const PaseoHostContext = createContext<PaseoHostHealth>({
  offlineSince: null,
});
export const usePaseoHostHealth = () => useContext(PaseoHostContext);
