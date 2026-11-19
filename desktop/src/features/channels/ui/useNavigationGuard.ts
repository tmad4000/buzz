import * as React from "react";
import { ConversationViewContext } from "@/features/conversations/ConversationViewContext";

import { registerNavigationGuard } from "@/app/navigation/navigationGuard";

export function useNavigationGuard(requireThreadEditResolution: () => boolean) {
  const view = React.useContext(ConversationViewContext);
  const active = view === null || (view.focused && view.visible);
  React.useLayoutEffect(() => {
    if (!active) return;
    return registerNavigationGuard(() => requireThreadEditResolution());
  }, [active, requireThreadEditResolution]);
}
