import * as React from "react";
import {
  ConversationViewGuardsContext,
  useConversationLeaveGuard,
} from "@/features/conversations/ConversationViewGuards";
import { ConversationViewContext } from "@/features/conversations/ConversationViewContext";

import { registerNavigationGuard } from "@/app/navigation/navigationGuard";

export function useNavigationGuard(requireThreadEditResolution: () => boolean) {
  useConversationLeaveGuard(requireThreadEditResolution);
  const view = React.useContext(ConversationViewContext);
  const guards = React.useContext(ConversationViewGuardsContext);
  const active = view === null || (view.focused && view.visible);
  React.useLayoutEffect(() => {
    if (!active) return;
    return registerNavigationGuard(() =>
      guards && view
        ? guards.allow(view.viewInstanceId)
        : requireThreadEditResolution(),
    );
  }, [active, requireThreadEditResolution, guards, view]);
}
