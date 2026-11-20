import { resolve } from "node:path";
import { defineConfig, mergeConfig, type Plugin } from "vite";
import desktopConfig from "../vite.config";

// The Buzz kit installs source anchors only in fixture builds. Keep the real
// thread and composer paths intact and fail if their expected seams change.
const patches = {
  "/app/router.tsx": {
    edits: [
      ["createHashHistory", "createMemoryHistory", 2],
      [
        "createMemoryHistory()",
        'createMemoryHistory({ initialEntries: [location.hash.slice(1) || "/"] })',
      ],
    ],
  },
  "/features/sidebar/ui/AppSidebar.tsx": {
    imports:
      'import { FixtureQuickLine } from "@/testing/autoRouteDemo/AutoRouteThread";',
    edits: [
      [
        "          suggestionChannels={channels}\n        />",
        "          suggestionChannels={channels}\n        />\n        <FixtureQuickLine />",
      ],
    ],
  },
  "/features/messages/ui/MessageComposer.tsx": {
    imports:
      'import { FixtureComposerControls, isAutoRouteFixtureThread } from "@/testing/autoRouteDemo/AutoRouteThread";',
    edits: [
      [
        "{toolbarExtraActions}",
        "{toolbarExtraActions}{!editTarget && isAutoRouteFixtureThread(channelId ?? null, typingParentEventId) && <FixtureComposerControls draft={contentRef.current} />}",
      ],
    ],
  },
  "/features/messages/ui/MessageThreadPanel.tsx": {
    imports:
      'import { prepareFixtureSend, sendFixtureMessage, isAutoRouteFixtureThread, FixtureThreadModelChip, FixtureTurns } from "@/testing/autoRouteDemo/AutoRouteThread";',
    edits: [
      [
        "const threadHeadId = threadHead?.id ?? null;",
        "const threadHeadId = threadHead?.id ?? null;\n  const fixtureRoute = isAutoRouteFixtureThread(channelId, threadHeadId);",
      ],
      [
        "<ThreadReplyRegion",
        "{fixtureRoute ? <FixtureTurns /> : <ThreadReplyRegion",
      ],
      [
        "          />\n          {!isThreadHeadRepliesCollapsed ? (",
        "          />}\n          {!isThreadHeadRepliesCollapsed ? (",
      ],
      [
        "onSend={onSend}",
        "onPreparingMentionSendChange={fixtureRoute ? prepareFixtureSend : undefined}\n              onSend={fixtureRoute ? sendFixtureMessage : onSend}",
      ],
      [
        "hasStoredDisclosure && sidebarMessages.length <= 1",
        "!fixtureRoute && hasStoredDisclosure && sidebarMessages.length <= 1",
      ],
      [
        "isHuddleTranscript ? undefined : nestedRoutingEntries",
        "fixtureRoute || isHuddleTranscript ? undefined : nestedRoutingEntries",
      ],
      [
        "headerLeading={headerLeading}",
        "headerLeading={headerLeading}\n              fixtureModelChip={fixtureRoute && <FixtureThreadModelChip />}",
      ],
    ],
  },
  "/features/messages/ui/MessageThreadPanelSkeleton.tsx": {
    edits: [
      [
        '  headerTitle = "Thread",',
        '  fixtureModelChip,\n  headerTitle = "Thread",',
      ],
      [
        "  headerTitle?: string;",
        "  fixtureModelChip?: React.ReactNode;\n  headerTitle?: string;",
      ],
      [
        "</AuxiliaryPanelHeaderGroup>",
        "</AuxiliaryPanelHeaderGroup>{fixtureModelChip}",
      ],
    ],
  },
  "/testing/e2eBridge.ts": {
    imports:
      'import { CHANNEL_ID, seedAutoRouteThread } from "@/testing/autoRouteDemo/threadFixture";',
    edits: [
      [
        "return mockChannels.map((channel)",
        "return mockChannels.filter(({ id }) => id === CHANNEL_ID).map((channel)",
      ],
      [
        "  resetMockRelayMembers(config);",
        "  seedAutoRouteThread(mockChannels, mockMessages);\n  resetMockRelayMembers(config);",
      ],
    ],
  },
  "/features/settings/hooks/use-updater.ts": {
    edits: [
      [
        "await fetch(FORK_RELEASE_FEED, {",
        "await fixtureReleaseFeed(FORK_RELEASE_FEED, {",
      ],
    ],
    imports:
      'const fixtureReleaseFeed: typeof fetch = async () => new Response("[]");',
  },
  "/features/gifs/relay.ts": {
    edits: [
      [
        "await fetch(url, {\n    headers: { Accept:",
        "await fixtureRelayInfo(url, {\n    headers: { Accept:",
      ],
    ],
    imports:
      'const fixtureRelayInfo: typeof fetch = async () => new Response("{}");',
  },
} as const;

function fixtureSlots(): Plugin {
  return {
    name: "buzz-auto-route-fixture-slots",
    enforce: "pre",
    transform(source, id) {
      const entry = Object.entries(patches).find(([file]) =>
        id.endsWith(`/src${file}`),
      );
      if (!entry) return;
      const [file, patch] = entry;
      let code = source;
      for (const [anchor, replacement, count = 1] of patch.edits) {
        if (code.split(anchor).length - 1 !== count) {
          this.error(
            `Buzz Auto-route fixture anchor changed in ${file}: ${anchor}`,
          );
        }
        code = code.replaceAll(anchor, () => replacement);
      }
      return {
        code: `${"imports" in patch ? patch.imports : ""}\n${code}`,
        map: null,
      };
    },
  };
}

export default defineConfig(async (env) => {
  const base = await desktopConfig({ ...env, mode: "e2e" });
  return mergeConfig(base, {
    base: "./",
    mode: "e2e",
    envDir: false,
    envPrefix: "BUZZ_FIXTURE_PUBLIC_",
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
    plugins: [fixtureSlots()],
    build: {
      outDir: "dist-auto-route-demo",
      rollupOptions: {
        input: resolve(import.meta.dirname, "../auto-route-demo.html"),
      },
    },
  });
});
