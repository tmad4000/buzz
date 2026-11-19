import fs from "node:fs";
import { FLEET_BRIDGE, FLEET_RECIPIENT, FLEET_D } from "./model.ts";
export const vectors = JSON.parse(
  fs.readFileSync(new URL("./contract-fixtures.json", import.meta.url), "utf8"),
);
export const clock = vectors.validPayloads[0].payload.observedAt;
export const snapshot = () => structuredClone(vectors.validPayloads[0].payload);
export const event = (id = "1".repeat(64), at = clock) => ({
  id,
  pubkey: FLEET_BRIDGE,
  kind: 30078,
  created_at: at,
  tags: [
    ["d", FLEET_D],
    ["p", FLEET_RECIPIENT],
  ],
  content: "Ag==",
  sig: "0".repeat(128),
});
export const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};
