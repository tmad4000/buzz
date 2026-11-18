import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { defineConfig, mergeConfig, type Plugin } from "vite";
import desktopConfig from "../vite.config";

// Explicit mockup-only seams. Fail on a missing or ambiguous anchor so a
// desktop refactor cannot silently turn a scenario into a different mockup.
const patches = {
  "/app/router.tsx": [
    ["createHashHistory", "createMemoryHistory", 2],
    [
      "createMemoryHistory()",
      'createMemoryHistory({ initialEntries: [location.hash.slice(1) || "/"] })',
    ],
  ],
  "/features/sidebar/ui/AppSidebar.tsx": [
    ["</SidebarSections>", '<MockupSlot name="sidebar" /></SidebarSections>'],
  ],
  "/features/channels/ui/ChannelScreen.tsx": [
    [
      "{pageHeaderActions}",
      '<MockupSlot name="channelHeader" />{pageHeaderActions}',
    ],
  ],
  "/features/channels/ui/ChannelPane.tsx": [
    [
      "const useFocusIdleDrawer = shouldUseFocusIdleDrawer({",
      'const dockMockupPage = useSplitAuxiliaryPane && hasIdleAuxiliary && idleAuxiliaryTitle === "Page" && hasMockupSlot("pageContents");\n  const useFocusIdleDrawer = !dockMockupPage && shouldUseFocusIdleDrawer({',
    ],
    [
      "{showIdleAuxiliaryOverThread ? idleAuxiliarySurface : null}",
      "{showIdleAuxiliaryOverThread || (dockMockupPage && threadHeadMessage) ? idleAuxiliarySurface : null}",
    ],
    [
      '<div className="relative isolate flex min-h-0 min-w-0 flex-1 flex-col">',
      '<MockupTimeline openThread={onOpenThread}><div className="relative isolate flex min-h-0 min-w-0 flex-1 flex-col">',
    ],
    [
      "</section>\n      ) : null}",
      '</MockupTimeline></section>\n      ) : null}<MockupSlot name="channelMargin" />',
    ],
    [
      "<ComposerUploadProgressOverlay />",
      '<ComposerUploadProgressOverlay /><MockupSlot name="composer" />',
    ],
  ],
  "/features/messages/ui/MessageRow.tsx": [
    [
      "{messageBodyNode}",
      '{hasMockupMessageBody(message.id) ? null : messageBodyNode}<MockupSlot name="message" context={{ id: message.id }} />',
      2,
    ],
  ],
  "/features/messages/ui/MessageThreadPanel.tsx": [
    ["<ThreadReplyRegion", '<MockupSlot name="thread" /><ThreadReplyRegion'],
  ],
  "/features/messages/ui/SendToThreadPicker.tsx": [
    [
      'className="w-80 max-w-[calc(100vw-2rem)] p-2"',
      'className={hasMockupSlot("picker") ? "w-[38rem] max-w-[calc(100vw-2rem)] p-2" : "w-80 max-w-[calc(100vw-2rem)] p-2"}',
    ],
    [
      "onOpenAutoFocus={(event) => {",
      'onOpenAutoFocus={(event) => { if (hasMockupSlot("picker")) return;',
    ],
    [
      '<div className="px-2 py-1 text-sm font-medium">',
      '{hasMockupSlot("picker") ? <MockupSlot name="picker" context={{ options, pick, close: () => setOpen(false) }} /> : <><div className="px-2 py-1 text-sm font-medium">',
    ],
    ["</PopoverContent>", "</>}</PopoverContent>"],
  ],
  "/features/channel-page/useChannelPageSurface.tsx": [
    [
      'variant={pageOpen ? "secondary" : "outline"}',
      'data-testid="mockup-page-toggle" variant={pageOpen ? "secondary" : "outline"}',
    ],
  ],
  "/features/channel-page/ChannelPage.tsx": [
    [
      'className="flex min-h-0 flex-1 flex-col gap-3"',
      'className="flex h-full min-h-0 flex-1 flex-col gap-3"',
    ],
    ["{onClose ? (", '<MockupSlot name="pageActions" />{onClose ? ('],
    [
      "<iframe\n          ref={frame}",
      '<div className="flex min-h-0 flex-1 overflow-hidden"><MockupSlot name="pageContents" context={{ scroll: (id) => frame.current?.contentWindow?.postMessage({ type: "buzz-mockup-page-scroll", id }, "*") }} /><iframe\n          ref={frame}',
    ],
    [
      'className="min-h-96 w-full flex-1 border-0 bg-white"\n        />',
      'className="min-h-0 w-full flex-1 border-0 bg-background"\n        /></div>',
    ],
  ],
  "/features/home/ui/InboxListPane.tsx": [
    ["  items,\n  onFilterChange", "  items: sourceItems,\n  onFilterChange"],
    [
      "  const isReminders =",
      "  const items = useMockupInboxItems(sourceItems, doneSet);\n  const isReminders =",
    ],
    [
      "\n              <InboxLabel\n",
      '\n              <MockupSlot name="inboxStatus" context={{ item, isDone }} /><InboxLabel\n',
    ],
    [
      "<Popover>\n                <PopoverTrigger",
      '<MockupSlot name="inboxActions" /><Popover>\n                <PopoverTrigger',
    ],
    [
      "<InboxFilterMenu\n",
      '{hasMockupSlot("inboxFilter") ? <MockupSlot name="inboxFilter" context={{ items: sourceItems, doneSet, onSelect }} /> : <InboxFilterMenu\n',
    ],
    [
      "reminderCount={reminders.length}\n              />",
      "reminderCount={reminders.length}\n              />}",
    ],
    [
      "{isReminders ? (\n        <div",
      '<MockupSlot name="inboxEntries" />{isReminders ? (\n        <div',
    ],
  ],
  "/features/gifs/relay.ts": [
    [
      "await fetch(url, {\n    headers: { Accept:",
      "await mockupRelayInfo(url, {\n    headers: { Accept:",
    ],
  ],
  "/features/settings/hooks/use-updater.ts": [
    [
      "await fetch(FORK_RELEASE_FEED, {",
      "await mockupReleaseResponse(FORK_RELEASE_FEED, {",
    ],
  ],
  "/testing/e2eBridge.ts": [
    [
      "mockChannels.map((channel) => toRawChannel(channel, config))",
      "mockChannels.filter((channel) => showMockupChannel(channel.id)).map((channel) => toRawChannel(channel, config))",
    ],
    [
      "resetMockRelayMembers(config);\n  resetMockRelayAgents",
      "applyMockupFixtures({ channels: mockChannels, messages: mockMessages, feed: mockFeedOverrides });\n  resetMockRelayMembers(config);\n  resetMockRelayAgents",
    ],
    [
      "[...mockFeedOverrides[category], ...defaultFeed[category]]",
      "[...mockFeedOverrides[category], ...(hasMockupFeed() ? [] : defaultFeed[category])]",
    ],
    [
      "emitMockHistory(socket, subId, channelIds, filter);",
      'if (!emitMockupPage(filter, (event) => sendWsText(socket.handler, ["EVENT", subId, event]))) {\n      emitMockHistory(socket, subId, channelIds, filter);\n    } else sendWsText(socket.handler, ["EOSE", subId]);',
    ],
  ],
} as const;

function pageScrollBridge(source: string) {
  const bridge = source.match(/const LINK_BRIDGE = `([\s\S]*?)`;/)?.[1];
  if (!bridge) throw new Error("Buzz mockup Page link bridge changed");
  const augmented =
    bridge +
    `
    addEventListener('message', (event) => {
      if (event.source !== parent || event.data?.type !== 'buzz-mockup-page-scroll') return;
      document.getElementById(event.data.id)?.scrollIntoView();
    });`;
  const sha = (text: string) =>
    createHash("sha256").update(text).digest("base64");
  if (!source.includes(sha(bridge)))
    throw new Error("Buzz mockup Page CSP hash changed");
  return source.replace(bridge, augmented).replace(sha(bridge), sha(augmented));
}

function mockupSlots(): Plugin {
  return {
    name: "buzz-mockup-slots",
    enforce: "pre",
    transform(source, id) {
      if (id.endsWith("/src/features/channel-page/sandbox.ts")) {
        return pageScrollBridge(source);
      }
      const entry = Object.entries(patches).find(([file]) =>
        id.endsWith(`/src${file}`),
      );
      if (!entry) return;
      const [file, replacements] = entry;
      for (const [anchor, replacement, count = 1] of replacements) {
        if (source.split(anchor).length - 1 !== count) {
          this.error(`Buzz mockup anchor changed in ${file}: ${anchor}`);
        }
        source = source.replaceAll(anchor, () => replacement);
      }
      const bindings = [
        "MockupSlot",
        "MockupTimeline",
        "hasMockupSlot",
        "hasMockupMessageBody",
        "useMockupInboxItems",
        "applyMockupFixtures",
        "hasMockupFeed",
        "emitMockupPage",
        "mockupReleaseResponse",
        "mockupRelayInfo",
        "showMockupChannel",
      ].filter((name) =>
        replacements.some(([, replacement]) => replacement.includes(name)),
      );
      const imports = bindings.length
        ? `import { ${bindings.join(", ")} } from "/mockup/runtime";\n`
        : "";
      return { code: imports + source, map: null };
    },
  };
}

export default defineConfig(async (env) => {
  const base = await desktopConfig({ ...env, mode: "e2e" });
  return mergeConfig(base, {
    base: "./",
    mode: "e2e",
    envDir: false,
    envPrefix: "BUZZ_MOCKUP_PUBLIC_",
    resolve: {
      alias: {
        "@protected-features": resolve(
          import.meta.dirname,
          "../src/protectedFeatures/public.ts",
        ),
        "@protected-feature-components": resolve(
          import.meta.dirname,
          "../src/protectedFeatures/publicUi.ts",
        ),
      },
    },
    // Use the app’s static assets without a live-reload socket.
    server: { hmr: false, ws: false },
    plugins: [mockupSlots()],
    build: {
      outDir: "dist-mockup",
      rollupOptions: { input: resolve(import.meta.dirname, "../mockup.html") },
    },
  });
});
