import assert from "node:assert/strict";
import test from "node:test";
import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
} from "nostr-tools/pure";
import {
  parseRuntimeContent,
  runtimeSessionLink,
  runtimeCardTemplate,
  selectRuntimeCard,
} from "./model.ts";
const secret = generateSecretKey();
const author = getPublicKey(secret);
const session = {
  serverId: "srv_KIFHQ_zsBnI2",
  agentId: "d3caa262-cdcd-454d-9d42-0cd05ac69156",
};
const card = { host: "gcp", session, updatedAt: 1000 };
const sign = (c = card, at = 1000, key = secret) =>
  finalizeEvent(runtimeCardTemplate(c, at), key);

test("self-signed exact coordinate admits author; forgery/actor substitution do not", () => {
  const event = sign();
  assert.deepEqual(selectRuntimeCard([event], author, 1000).card, card);
  assert.equal(selectRuntimeCard([event], "f".repeat(64), 1000), null);
  assert.equal(
    selectRuntimeCard(
      [{ ...event, content: JSON.stringify({ host: "m4" }) }],
      author,
      1000,
    ),
    null,
  );
  assert.equal(
    selectRuntimeCard([sign(card, 1000, generateSecretKey())], author, 1000),
    null,
  );
  const forgedActor = finalizeEvent(
    {
      ...runtimeCardTemplate(card, 1000),
      tags: [
        ["d", "agent-runtime"],
        ["actor", author],
      ],
    },
    generateSecretKey(),
  );
  assert.equal(selectRuntimeCard([forgedActor], author, 1000), null);
  for (const tags of [
    [["d", "other"]],
    [
      ["d", "agent-runtime"],
      ["d", "other"],
    ],
  ]) {
    const wrong = finalizeEvent(
      { ...runtimeCardTemplate(card, 1000), tags },
      secret,
    );
    assert.equal(selectRuntimeCard([wrong], author, 1000), null);
  }
});

test("newest signed replacement wins; invalid latest hides old session, including equal time tie", () => {
  const old = sign();
  const latest = sign({ host: "m4", runtime: "Hermes daemon" }, 1001);
  assert.equal(selectRuntimeCard([old, latest], author, 1001).card.host, "m4");
  const invalid = finalizeEvent(
    { ...runtimeCardTemplate(card, 1002), content: "{}" },
    secret,
  );
  assert.equal(selectRuntimeCard([old, invalid], author, 1002), null);
  const tie = sign({ host: "gcp", runtime: "alternate" }, 1000);
  assert.equal(
    selectRuntimeCard([old, tie], author, 1000).eventId,
    [old, tie].sort((a, b) => a.id.localeCompare(b.id))[0].id,
  );
});

test("host/session pairing, exact paired routes and bounded payloads", () => {
  assert.equal(
    runtimeSessionLink(session),
    `paseo://h/${session.serverId}/agent/${session.agentId}`,
  );
  for (const s of [
    { ...session, serverId: "srv_unpaired" },
    { ...session, agentId: `${session.agentId}?x` },
    { ...session, agentId: "../settings" },
  ])
    assert.equal(runtimeSessionLink(s), null);
  for (const c of [
    { host: "m4", session },
    { host: "constructor" },
    { host: "gcp", resume: Array(9).fill({ label: "x", command: "x" }) },
    { host: "gcp", logs: "x".repeat(1025) },
    { host: "gcp", resume: [{ label: "Run", command: "\u001b[31m" }] },
  ])
    assert.equal(parseRuntimeContent(JSON.stringify(c)), null);
  assert.equal(parseRuntimeContent("x".repeat(16385)), null);
  assert.equal(selectRuntimeCard([sign(card, 2000)], author, 1000), null);
  assert.equal(
    selectRuntimeCard([sign({ ...card, updatedAt: 9999 })], author, 1000),
    null,
  );
});

test("Hermes card holds inert kickstart/log instructions and delegate links, no fabricated daemon session", () => {
  const hermes = {
    host: "m4",
    runtime: "hermes-acp under Buzz launchd",
    logs: "~/.buzz/logs/hermes-agent.log",
    resume: [
      {
        label: "Restart Hermes on M4",
        command: "launchctl kickstart -k gui/$(id -u)/com.buzz.hermes-agent",
      },
      { label: "Logs", command: "tail -f ~/.buzz/logs/hermes-agent.log" },
    ],
    delegates: [{ ...session, serverId: "srv_uvq8mbWTDr9Y", label: "Worker" }],
  };
  assert.deepEqual(parseRuntimeContent(JSON.stringify(hermes)), hermes);
  const parsed = selectRuntimeCard([sign(hermes)], author, 1000);
  assert.equal(parsed.card.session, undefined);
  assert.equal(parsed.attestedAt, 1000);
});
