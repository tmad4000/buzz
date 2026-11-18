import type { RelayEvent } from "@/shared/api/types";

export const CHANNEL = "9a1657ac-f7aa-5db0-b632-d8bbeb6dfb50";
export const SIDE = "9dae0116-799b-5071-a0a8-fdd30a91a35d";
export const JACOB = "deadbeef".repeat(8);
export const SOL =
  "953d3363262e86b770419834c53d2446409db6d918a57f8f339d495d54ab001f";
export const NORA =
  "bb22a5299220cad76ffd46190ccbeede8ab5dc260faa28b6e5a2cb31b9aff260";

export const profiles = [
  { pubkey: JACOB, displayName: "tmad4000", about: "Buzz Ideaflow workspace" },
  {
    pubkey: SOL,
    displayName: "Sol",
    about: "Desktop builds and review",
    isAgent: true,
  },
  { pubkey: NORA, displayName: "nora" },
];
export const channels = {
  [CHANNEL]: { name: "Paseo P2", topic: "Work in progress and design reviews" },
  [SIDE]: { name: "paseo-later", topic: "Follow-ups and side agents" },
};

export const eventId = (index: number) => index.toString(16).padStart(64, "0");
const fixtureTime = Math.floor(Date.now() / 1000);
export const minutesAgo = (minutes: number) => fixtureTime - minutes * 60;

export function message(
  index: number,
  pubkey: string,
  content: string,
  age: number,
  {
    channel = CHANNEL,
    root,
    kind = 9,
    tags = [],
  }: {
    channel?: string;
    root?: number;
    kind?: number;
    tags?: string[][];
  } = {},
): RelayEvent {
  return {
    id: eventId(index),
    kind,
    pubkey,
    content,
    created_at: minutesAgo(age),
    tags: [
      ["h", channel],
      ...(root
        ? [
            ["e", eventId(root), "", "root"],
            ["e", eventId(root), "", "reply"],
          ]
        : []),
      ...tags,
    ],
    sig: "0".repeat(128),
  };
}
