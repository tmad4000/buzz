import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, within } from "@testing-library/react";
import {
  finalizeEvent,
  generateSecretKey,
  verifyEvent,
} from "nostr-tools/pure";
import React, { act } from "react";

import { BRIDGE_STATUS_SIGNER } from "../messages/lib/bridgeStatusCard.ts";
import { FeatureGate } from "../../shared/features/FeatureGate.tsx";
import { clearOverride, setOverride } from "../../shared/features/store.ts";
import { emitChange } from "../../shared/features/useFeatureEnabled.ts";

const go = [];
const opened = [];
globalThis.sideAgentFixture = {
  // The producer's private key is not a test fixture. Accept explicitly
  // marked synthetic contract events and use real verification otherwise.
  verify: (event) =>
    event.sig === "synthetic-test-signature" || verifyEvent(event),
  navigate: (kind, ...args) => {
    go.push([kind, ...args]);
    return Promise.resolve(true);
  },
  open: (link) => {
    opened.push(link);
    return Promise.resolve();
  },
};
registerHooks({
  resolve(specifier, context, next) {
    const importer = context.parentURL ?? "";
    if (
      importer.endsWith("/side-agents/model.ts") &&
      specifier === "nostr-tools/pure"
    ) {
      return { shortCircuit: true, url: "side-agent-fixture:verify" };
    }
    if (importer.endsWith("/side-agents/SideAgentsSection.tsx")) {
      if (specifier === "@/app/navigation/useAppNavigation") {
        return { shortCircuit: true, url: "side-agent-fixture:navigate" };
      }
      if (specifier === "@tauri-apps/plugin-opener") {
        return { shortCircuit: true, url: "side-agent-fixture:opener" };
      }
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (!url.startsWith("side-agent-fixture:")) return next(url, context);
    const sources = {
      "side-agent-fixture:verify":
        "export const verifyEvent = globalThis.sideAgentFixture.verify;",
      "side-agent-fixture:navigate": `export function useAppNavigation() {
        return { goChannel: (...args) => globalThis.sideAgentFixture.navigate("channel", ...args),
          goForumPost: (...args) => globalThis.sideAgentFixture.navigate("forum", ...args) };
      }`,
      "side-agent-fixture:opener":
        "export const openUrl = globalThis.sideAgentFixture.open;",
    };
    return { shortCircuit: true, format: "module", source: sources[url] };
  },
});

const stream = { id: "p2", name: "#p2", channelType: "stream", isMember: true };
const dm = {
  id: "dm",
  name: "Paseo DM",
  channelType: "dm",
  isMember: true,
  participants: [],
  participantPubkeys: [],
};
const host = "srv_KIFHQ_zsBnI2";
const root = "b".repeat(64);
const rootAgent = "d3caa262-cdcd-454d-9d42-0cd05ac69156";
const agentId = (i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
const eventId = (i) => i.toString(16).padStart(64, "0");
const now = Math.floor(Date.now() / 1000);

function statusCard({
  seq,
  agent = agentId(seq),
  title = `Agent ${seq}`,
  channel = stream,
  status = "progress",
  server = host,
  time = now,
  target,
}) {
  return {
    id: eventId(seq),
    pubkey: BRIDGE_STATUS_SIGNER,
    kind: target ? 40003 : 9,
    created_at: time,
    content: "synthetic status",
    sig: "synthetic-test-signature",
    tags: [
      ["h", channel.id],
      target ? ["e", target] : ["e", root, "", "reply"],
      ["agent", agent, server, title],
      ["buzz-status", status],
      ["buzz-status-source", "root"],
      ["paseo-link", `paseo://h/${server}/agent/${agent}`],
    ],
  };
}

test("folds only verified reports by newest signed revision, retains the original thread binding, and hides root", async () => {
  const { foldSideAgents } = await import("./model.ts");
  const original = statusCard({ seq: 1, time: now - 600 });
  const newerCard = statusCard({
    seq: 2,
    agent: agentId(1),
    channel: dm,
    time: now - 120,
  });
  const revision = statusCard({
    seq: 3,
    agent: agentId(1),
    title: "Latest title",
    target: original.id,
    status: "waiting",
  });
  const tiedRevision = statusCard({
    seq: 4,
    agent: agentId(1),
    target: original.id,
    status: "done",
  });
  const foreign = statusCard({ seq: 5, channel: dm });
  const untrusted = { ...statusCard({ seq: 6 }), pubkey: "f".repeat(64) };
  const unattributed = statusCard({ seq: 7, agent: rootAgent });
  const forgedTemplate = statusCard({ seq: 8 });
  const { kind, created_at, content, tags } = forgedTemplate;
  const forged = {
    ...finalizeEvent({ kind, created_at, content, tags }, generateSecretKey()),
    pubkey: BRIDGE_STATUS_SIGNER,
  };
  // Strip nostr-tools' verification symbol, as a relay/cache round trip does.
  const serializedForgery = JSON.parse(JSON.stringify(forged));
  const origin = {
    ...original,
    id: root,
    pubkey: "1".repeat(64),
    tags: [["h", stream.id]],
    content: "Old thread title",
  };
  const rootEdit = {
    ...origin,
    id: eventId(60),
    kind: 40003,
    content: "Layout review\nSecond line",
    tags: [
      ["h", stream.id],
      ["e", root],
    ],
  };

  for (const order of [
    [revision, tiedRevision],
    [tiedRevision, revision],
  ]) {
    const reports = foldSideAgents([
      {
        channel: stream,
        windows: [
          [
            original,
            foreign,
            untrusted,
            unattributed,
            serializedForgery,
            origin,
            rootEdit,
          ],
          order,
        ],
      },
      { channel: dm, windows: [[newerCard]] },
    ]);
    assert.equal(reports.length, 1);
    assert.deepEqual(reports[0], {
      agentId: agentId(1),
      title: "Latest title",
      channelId: stream.id,
      channelType: "stream",
      channelName: "#p2",
      threadTitle: "Layout review",
      rootId: root,
      cardId: original.id,
      revisionId: revision.id,
      reportedAt: now,
      source: "root",
      state: "waiting",
      host: "GCP",
      paseoLink: `paseo://h/${host}/agent/${agentId(1)}`,
    });
  }
  assert.deepEqual(
    foldSideAgents([
      { channel: { ...stream, isMember: false }, windows: [[original]] },
    ]),
    [],
  );
  assert.deepEqual(
    foldSideAgents([
      {
        channel: stream,
        windows: [
          [
            original,
            { id: eventId(9), kind: 9005, tags: [["e", original.id]] },
          ],
        ],
      },
    ]),
    [],
  );
});

test("orders attention first, flags two-hour reports as stale, and limits older completions", async () => {
  const { foldSideAgents, presentSideAgents } = await import("./model.ts");
  const reports = foldSideAgents([
    {
      channel: stream,
      windows: [
        [
          statusCard({ seq: 1, status: "done" }),
          statusCard({ seq: 2, time: now - 7200 }),
          statusCard({ seq: 3, status: "waiting", time: now - 250 }),
          statusCard({ seq: 4, status: "done", time: now - 86401 }),
          statusCard({ seq: 5, status: "done", time: now - 8 * 86400 }),
          statusCard({ seq: 6, time: now - 7199, server: "srv_UNLISTED" }),
        ],
      ],
    },
  ]);
  const initial = presentSideAgents(reports, now, false);
  assert.equal(initial.hasOlder, true);
  assert.deepEqual(
    initial.visible.map((r) => r.state),
    ["waiting", "working", "stale", "done"],
  );
  assert.equal(initial.visible[1].paseoLink, null);
  assert.deepEqual(
    presentSideAgents(reports, now, true).visible.map((r) => r.agentId),
    [3, 6, 2, 1, 4].map(agentId),
  );
});

test("feature defaults off, then shows cached rows, guarded route and opener actions, and removes revoked channels", async () => {
  const { SideAgentsSidebar } = await import("./SideAgentsSection.tsx");
  const { useState } = React;
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity } },
  });
  client.setQueryData(
    ["thread-replies", stream.id, root],
    [statusCard({ seq: 10, title: "Layout worker" })],
  );
  client.setQueryData(
    ["channel-messages", dm.id],
    [statusCard({ seq: 11, channel: dm, title: "DM worker" })],
  );
  function App({ channels }) {
    const [collapsed, setCollapsed] = useState(false);
    return React.createElement(
      QueryClientProvider,
      { client },
      React.createElement(
        FeatureGate,
        { feature: "sideAgents" },
        React.createElement(SideAgentsSidebar, {
          channels,
          collapsed,
          onToggleCollapsed: () => setCollapsed((previous) => !previous),
        }),
      ),
    );
  }
  const view = render(React.createElement(App, { channels: [stream, dm] }));
  try {
    assert.equal(view.queryByRole("button", { name: "Side agents" }), null);
    await act(async () => {
      setOverride("sideAgents", true);
      emitChange();
    });
    const row = view.getByText("Layout worker").closest("li");
    fireEvent.click(
      within(row).getByRole("button", { name: /^Layout worker/ }),
    );
    assert.deepEqual(go, [
      [
        "channel",
        stream.id,
        { thread: root, threadRootId: root, messageId: eventId(10) },
      ],
    ]);
    fireEvent.click(
      within(row).getByRole("button", { name: "Open Layout worker in Paseo" }),
    );
    assert.deepEqual(opened, [`paseo://h/${host}/agent/${agentId(10)}`]);
    assert.equal(go.length, 1, "the external action must not open a thread");
    fireEvent.click(view.getByRole("button", { name: "Side agents" }));
    assert.equal(view.queryByRole("button", { name: /^Layout worker/ }), null);
    fireEvent.click(view.getByRole("button", { name: "Side agents" }));
    const replyKey = ["thread-replies", stream.id, root];
    await act(async () =>
      client.setQueryData(replyKey, (events) => [
        ...events,
        statusCard({
          seq: 12,
          agent: agentId(10),
          title: "Edited worker",
          target: eventId(10),
          status: "waiting",
          time: now + 1,
        }),
      ]),
    );
    assert.ok(view.getByText("Edited worker"));
    assert.equal(view.queryByText("Layout worker"), null);
    view.rerender(
      React.createElement(App, {
        channels: [dm, { ...stream, isMember: false }],
      }),
    );
    assert.equal(view.queryByText("Edited worker"), null);
    assert.ok(view.getByText("DM worker"));
    await act(async () =>
      client.removeQueries({ queryKey: ["channel-messages", dm.id] }),
    );
    assert.equal(view.queryByRole("button", { name: "Side agents" }), null);
  } finally {
    view.unmount();
    clearOverride("sideAgents");
    emitChange();
    client.clear();
  }
});
