import {
  useDeviceOffline,
  offlineNeedsConnection,
} from "@/shared/api/offlineConnection";
import { Plus } from "lucide-react";

import { Button } from "@/shared/ui/button";

type CreateNewButtonProps = {
  ariaLabel?: string;
  disabled?: boolean;
  label?: string;
  onClick: () => void;
  variant?: "default" | "outline";
};

export function CreateNewButton({
  ariaLabel,
  disabled = false,
  label = "New",
  onClick,
  variant = "default",
}: CreateNewButtonProps) {
  const offline = useDeviceOffline();
  return (
    <Button
      aria-label={ariaLabel}
      disabled={disabled || offline}
      title={offline ? "Needs a connection" : undefined}
      onClick={() => {
        if (!offlineNeedsConnection()) onClick();
      }}
      size="sm"
      type="button"
      variant={variant}
    >
      <Plus className="h-4 w-4" />
      {label}
    </Button>
  );
}
