import { offlineNeedsConnection } from "@/shared/api/offlineConnection";
/** The local start may await IPC; membership is checked again after that await. */
export async function addHuddleAgentAfterStart<T>(
  start: () => Promise<void>,
  add: () => Promise<T>,
): Promise<T> {
  if (offlineNeedsConnection()) throw new Error("Needs a connection");
  await start();
  if (offlineNeedsConnection()) throw new Error("Needs a connection");
  return add();
}
