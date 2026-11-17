import * as React from "react";
import { loadActiveCommunityId } from "@/features/communities/communityStorage";
import {
  loadThreadDisplayPolicy,
  saveThreadDisplayPolicy,
  threadDisplayKey,
  type ThreadDisplayPolicy,
  type ThreadDisplayMode,
} from "@/features/messages/lib/threadDisplayPolicy";
import { SegmentedControl } from "@/shared/ui/segmented-control";
import { SettingsOptionGroup, SettingsOptionRow } from "./SettingsOptionGroup";
const options = [
  { value: "collapsed", label: "Collapsed" },
  { value: "smart", label: "Smart" },
  { value: "expanded", label: "Expanded" },
] as const;
export function ThreadDisplaySettings({
  currentPubkey,
}: {
  currentPubkey?: string;
}) {
  const community = React.useMemo(loadActiveCommunityId, []);
  const storageKey = threadDisplayKey(community, currentPubkey);
  return (
    <ScopedThreadDisplaySettings key={storageKey} storageKey={storageKey} />
  );
}
function ScopedThreadDisplaySettings({ storageKey }: { storageKey: string }) {
  const [policy, setPolicy] = React.useState(() =>
    loadThreadDisplayPolicy(storageKey),
  );
  const current = React.useRef(policy);
  const [failed, setFailed] = React.useState(false);
  const change = (
    field: keyof ThreadDisplayPolicy,
    mode: ThreadDisplayMode,
  ) => {
    const next = { ...current.current, [field]: mode };
    current.current = next;
    setPolicy(next);
    setFailed(!saveThreadDisplayPolicy(storageKey, next));
  };
  return (
    <SettingsOptionGroup
      title="Conversation display"
      data-testid="thread-display-settings"
    >
      {(
        [
          ["channels", "Threads in channels"],
          ["replies", "Replies inside threads"],
        ] as const
      ).map(([field, label]) => (
        <SettingsOptionRow key={field}>
          <p className="text-sm font-medium">{label}</p>
          <SegmentedControl
            className="max-w-full"
            legend={label}
            optionTestIdPrefix={`thread-display-${field}`}
            testId={`thread-display-${field}`}
            options={options}
            value={policy[field]}
            onValueChange={(value) => change(field, value)}
          />
        </SettingsOptionRow>
      ))}
      <SettingsOptionRow>
        <p className="text-sm text-muted-foreground">
          Smart shows short answers and compact conversations. Changes apply on
          next entry; remembered choices stay as you left them. Only for this
          identity and community on this device.
        </p>
      </SettingsOptionRow>
      {failed ? (
        <SettingsOptionRow>
          <p role="status" className="text-sm text-muted-foreground">
            View preference could not be saved. This choice lasts for this
            settings visit.
          </p>
        </SettingsOptionRow>
      ) : null}
    </SettingsOptionGroup>
  );
}
