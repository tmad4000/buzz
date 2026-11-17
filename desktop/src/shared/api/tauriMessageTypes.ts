export type RawSendChannelMessageResult = {
  signed_event?: import("./types").RelayEvent;
  event_id: string;
  parent_event_id: string | null;
  root_event_id: string | null;
  depth: number;
  created_at: number;
};
