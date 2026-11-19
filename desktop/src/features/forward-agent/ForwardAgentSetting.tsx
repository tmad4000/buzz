import { toast } from "sonner";
import { SettingsOptionRow } from "@/features/settings/ui/SettingsOptionGroup";
import { Switch } from "@/shared/ui/switch";
import { setForwardAgentEnabled, useForwardAgentEnabled } from "./preference";
export function ForwardAgentSetting() {
  const enabled = useForwardAgentEnabled();
  return (
    <SettingsOptionRow>
      <div>
        <label htmlFor="forward-agent-enabled" className="text-sm font-medium">
          Forward to agent
        </label>
        <p className="text-sm text-muted-foreground">
          Show message actions for linked forwards to your Direct agents. Off by
          default on this device.
        </p>
      </div>
      <Switch
        id="forward-agent-enabled"
        checked={enabled}
        onCheckedChange={(value) => {
          try {
            setForwardAgentEnabled(value);
          } catch {
            toast.error("Could not save forwarding preference");
          }
        }}
      />
    </SettingsOptionRow>
  );
}
