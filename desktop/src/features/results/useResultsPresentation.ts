import { useCallback, useState } from "react";
import { CHANNEL_PRESENTATION_FEATURE } from "@/features/channels/ui/ChannelPresentationSwitch";
import type { Channel } from "@/shared/api/types";
import { useFeatureEnabled } from "@/shared/features";

const AVAILABLE_PRESENTATIONS = ["timeline", "results"] as const;

/** Keep the experimental view on the current channel's desktop surface. */
export function useResultsPresentation(
  channel: Channel | null,
  isHuddle: boolean,
  scope: string,
) {
  const enabled = useFeatureEnabled(CHANNEL_PRESENTATION_FEATURE);
  const available =
    enabled &&
    !isHuddle &&
    channel?.isMember &&
    channel.channelType === "stream"
      ? AVAILABLE_PRESENTATIONS
      : null;
  const scopeKey = available ? JSON.stringify([scope, channel?.id]) : null;
  const [resultsScope, setResultsScope] = useState<string | null>(null);
  const selectResults = useCallback(
    (selected: boolean) => setResultsScope(selected ? scopeKey : null),
    [scopeKey],
  );
  return {
    active: scopeKey !== null && scopeKey === resultsScope,
    available,
    selectResults,
  };
}
