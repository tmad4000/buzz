import { createHashHistory, createRouter } from "@tanstack/react-router";

import { shouldRestoreRouterElement } from "@/features/conversations/routerScrollPolicy";
import { routeTree } from "@/app/routeTree.gen";

export const router = createRouter({
  routeTree,
  history: createHashHistory(),
  scrollRestoration: true,
  shouldRestoreScrollElement: shouldRestoreRouterElement,
  getScrollRestorationKey: (location: { pathname: string }) =>
    location.pathname,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
