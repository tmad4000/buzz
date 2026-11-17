import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { projectThreadLinks } from "../../desktop/src/features/messages/lib/threadLinkProjection.ts";
import {
  parseThreadLink,
  threadMessageAuthor,
} from "../../desktop/src/features/messages/lib/threadLinks.ts";
import {
  CONTENT,
  UUID,
  isHex,
  RELAY,
  ensure,
  exactKeys,
  fail,
  hash,
} from "./thread_link_common.mjs";

const RUNTIME_FILES = [
  "scripts/ideaflow/thread-links",
  "scripts/ideaflow/thread_link_loader.mjs",
  "scripts/ideaflow/thread_link_aliases.mjs",
  "scripts/ideaflow/thread_link_common.mjs",
  "scripts/ideaflow/thread_link_transport.mjs",
  "scripts/ideaflow/thread_link_snapshot.mjs",
  "scripts/ideaflow/thread_link_plan.mjs",
  "scripts/ideaflow/thread_link_journal.mjs",
  "scripts/ideaflow/thread_link_apply.mjs",
  "scripts/ideaflow/thread_link_cli.mjs",
  "desktop/src/features/messages/lib/threadLinks.ts",
  "desktop/src/features/messages/lib/threadLinkProjection.ts",
  "desktop/src/features/messages/lib/threading.ts",
  "desktop/src/shared/lib/authors.ts",
  "desktop/src/shared/lib/pubkey.ts",
  "desktop/src/shared/lib/nostrUtils.ts",
  "desktop/package.json",
  "pnpm-lock.yaml",
];

/** Bind resumes to exact runtime source and dependency locks, never a new hash. */
export function toolFingerprint() {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  return hash(
    JSON.stringify(
      RUNTIME_FILES.map((name) => [name, hash(fs.readFileSync(root + name))]),
    ),
  );
}

export function requestedOperations(value) {
  ensure(
    Array.isArray(value) && value.length >= 1 && value.length <= 100,
    "invalid-operations",
  );
  const children = new Set();
  return value.map((operation) => {
    exactKeys(
      operation,
      ["operation", "childEventId", "parentEventId"],
      ["confidence"],
    );
    ensure(
      ["link", "unlink"].includes(operation.operation) &&
        isHex(operation.childEventId) &&
        !children.has(operation.childEventId),
      "invalid-operations",
    );
    ensure(
      operation.operation === "link"
        ? isHex(operation.parentEventId) &&
            operation.childEventId !== operation.parentEventId
        : operation.parentEventId === null,
      "invalid-operations",
    );
    const confidence = operation.confidence ?? "explicit";
    ensure(
      ["explicit", "low", "medium", "high"].includes(confidence),
      "invalid-operations",
    );
    children.add(operation.childEventId);
    return {
      operation: operation.operation,
      childEventId: operation.childEventId,
      parentEventId: operation.parentEventId,
      confidence,
    };
  });
}

export function buildPlan(client, current, operations, fingerprint) {
  ensure(isHex(fingerprint), "invalid-tool-fingerprint");
  const byId = new Map(current.messages.map((event) => [event.id, event]));
  const rows = requestedOperations(operations).map((operation) => {
    const child = byId.get(operation.childEventId);
    ensure(
      child &&
        (operation.parentEventId === null || byId.has(operation.parentEventId)),
      "source-message-unavailable",
    );
    const author = threadMessageAuthor(child, current.scope);
    const graph = current.projection.messages.get(child.id);
    ensure(graph, "source-message-unavailable");
    ensure(
      operation.operation === "link"
        ? graph.presentationParentId !== operation.parentEventId
        : graph.presentationParentId !== graph.canonicalParentId,
      "operation-already-matches",
    );
    return {
      ...operation,
      effectiveChildAuthor: author,
      eligibility:
        author === client.actorPubkey ? "self-author" : "proposal-only",
      canonicalParentId: graph.canonicalParentId,
      canonicalRootId: graph.canonicalRootId,
      presentationParentId: graph.presentationParentId,
      presentationRootId: graph.presentationRootId,
      expectedHead: current.projection.heads.get(child.id) ?? null,
    };
  });
  const newest = Math.max(
    -1,
    ...current.annotations.map((event) => event.created_at),
  );
  const timestamp = client.now();
  ensure(timestamp > newest, "annotation-clock-not-advanced");
  for (const operation of rows) {
    operation.eventBytes =
      operation.eligibility === "self-author"
        ? client.signAnnotation(current.scope.channelId, operation, timestamp)
        : null;
    operation.eventId = operation.eventBytes
      ? JSON.parse(operation.eventBytes).id
      : null;
  }
  const actionable = rows.filter((operation) => operation.eventBytes);
  preparedProjection(
    current,
    actionable.map((operation) => operation.eventBytes),
  );
  return {
    version: 1,
    kind: "buzz-thread-link-plan",
    reviewRequired: true,
    communityUrl: RELAY,
    channelId: current.scope.channelId,
    actorPubkey: client.actorPubkey,
    toolFingerprint: fingerprint,
    capturedAt: client.now(),
    registrationDigest: current.summary.registrationDigest,
    snapshot: current.summary,
    snapshotDigest: current.digest,
    operations: rows,
  };
}

export function validatePlan(plan) {
  exactKeys(plan, [
    "version",
    "kind",
    "reviewRequired",
    "communityUrl",
    "channelId",
    "actorPubkey",
    "toolFingerprint",
    "capturedAt",
    "registrationDigest",
    "snapshot",
    "snapshotDigest",
    "operations",
  ]);
  ensure(
    plan.version === 1 &&
      plan.kind === "buzz-thread-link-plan" &&
      plan.reviewRequired === true &&
      plan.communityUrl === RELAY &&
      typeof plan.channelId === "string" &&
      UUID.test(plan.channelId) &&
      isHex(plan.actorPubkey) &&
      isHex(plan.toolFingerprint) &&
      isHex(plan.snapshotDigest) &&
      Number.isSafeInteger(plan.capturedAt) &&
      plan.capturedAt >= 0,
    "invalid-plan",
  );
  ensure(
    plan.registrationDigest === null || isHex(plan.registrationDigest),
    "invalid-plan",
  );
  exactKeys(plan.snapshot, [
    "relayPubkey",
    "registrationDigest",
    "metadataId",
    "rosterId",
    "adminsId",
    "creatorId",
    "members",
    "messageIds",
    "annotationIds",
  ]);
  for (const name of ["relayPubkey", "metadataId", "rosterId"])
    ensure(isHex(plan.snapshot[name]), "invalid-plan");
  for (const name of ["registrationDigest", "adminsId", "creatorId"])
    ensure(
      plan.snapshot[name] === null || isHex(plan.snapshot[name]),
      "invalid-plan",
    );
  ensure(
    plan.snapshot.registrationDigest === plan.registrationDigest,
    "invalid-plan",
  );
  ensure(
    Array.isArray(plan.snapshot.members) &&
      plan.snapshot.members.length >= 1 &&
      plan.snapshot.members.length <= 2,
    "invalid-plan",
  );
  for (const member of plan.snapshot.members) {
    exactKeys(member, ["pubkey", "role"]);
    ensure(
      isHex(member.pubkey) &&
        ["member", "admin", "owner"].includes(member.role),
      "invalid-plan",
    );
  }
  for (const [name, bound] of [
    ["messageIds", 5000],
    ["annotationIds", 1000],
  ]) {
    const ids = plan.snapshot[name];
    ensure(
      Array.isArray(ids) &&
        ids.length <= bound &&
        ids.every((id) => isHex(id)) &&
        new Set(ids).size === ids.length,
      "invalid-plan",
    );
  }
  ensure(
    hash(JSON.stringify(plan.snapshot)) === plan.snapshotDigest,
    "invalid-plan-snapshot-digest",
  );
  ensure(Array.isArray(plan.operations), "invalid-plan");
  const requested = [];
  for (const operation of plan.operations) {
    exactKeys(operation, [
      "operation",
      "childEventId",
      "parentEventId",
      "confidence",
      "effectiveChildAuthor",
      "eligibility",
      "canonicalParentId",
      "canonicalRootId",
      "presentationParentId",
      "presentationRootId",
      "expectedHead",
      "eventBytes",
      "eventId",
    ]);
    ensure(
      isHex(operation.effectiveChildAuthor) &&
        ["self-author", "proposal-only"].includes(operation.eligibility),
      "invalid-plan",
    );
    for (const name of [
      "canonicalParentId",
      "canonicalRootId",
      "presentationParentId",
      "expectedHead",
    ])
      ensure(
        operation[name] === null || isHex(operation[name]),
        "invalid-plan",
      );
    ensure(isHex(operation.presentationRootId), "invalid-plan");
    if (operation.eligibility === "self-author") {
      ensure(
        typeof operation.eventBytes === "string" &&
          operation.eventBytes.length <= 4096 &&
          isHex(operation.eventId),
        "invalid-plan-wire",
      );
      operationEvent(plan, operation);
    } else
      ensure(
        operation.eventBytes === null && operation.eventId === null,
        "invalid-plan-wire",
      );
    requested.push(
      Object.fromEntries(
        ["operation", "childEventId", "parentEventId", "confidence"].map(
          (name) => [name, operation[name]],
        ),
      ),
    );
  }
  requestedOperations(requested);
  return plan;
}

/** Accept only canonical exact annotation bytes, not arbitrary event writers. */
export function operationEvent(plan, operation) {
  ensure(operation.eligibility === "self-author", "not-child-author");
  let event;
  try {
    event = JSON.parse(operation.eventBytes);
  } catch {
    fail("invalid-plan-wire");
  }
  exactKeys(event, [
    "id",
    "pubkey",
    "created_at",
    "kind",
    "content",
    "tags",
    "sig",
  ]);
  ensure(
    JSON.stringify(event) === operation.eventBytes &&
      event.id === operation.eventId &&
      event.pubkey === plan.actorPubkey &&
      event.content === CONTENT,
    "invalid-plan-wire",
  );
  const parsed = parseThreadLink(event, {
    communityUrl: RELAY,
    channelId: plan.channelId,
  });
  ensure(
    parsed.state === "valid" &&
      parsed.annotation.operation === operation.operation &&
      parsed.annotation.childId === operation.childEventId &&
      parsed.annotation.parentId === operation.parentEventId &&
      parsed.annotation.previousId === operation.expectedHead,
    "invalid-plan-wire",
  );
  return event;
}

export function verifyPlanSource(
  plan,
  client,
  current,
  fingerprint,
  baselineDigest = current.digest,
) {
  validatePlan(plan);
  ensure(
    plan.actorPubkey === client.actorPubkey &&
      plan.channelId === current.scope.channelId,
    "plan-identity-scope-mismatch",
  );
  ensure(
    plan.registrationDigest === current.summary.registrationDigest,
    "scope-registration-changed",
  );
  ensure(plan.toolFingerprint === fingerprint, "tool-fingerprint-changed");
  ensure(plan.snapshotDigest === baselineDigest, "reviewed-snapshot-changed");
  const byId = new Map(current.messages.map((event) => [event.id, event]));
  for (const operation of plan.operations) {
    const child = byId.get(operation.childEventId);
    ensure(
      child &&
        operation.eligibility === "self-author" &&
        operation.effectiveChildAuthor === client.actorPubkey &&
        threadMessageAuthor(child, current.scope) === client.actorPubkey,
      "not-child-author",
    );
    const graph = current.projection.messages.get(child.id);
    ensure(
      graph?.canonicalParentId === operation.canonicalParentId &&
        graph?.canonicalRootId === operation.canonicalRootId,
      "canonical-source-changed",
    );
  }
}

/** Exact staged events must all be selected before any write intent is saved. */
export function preparedProjection(current, bytes) {
  const events = bytes.map((value) => JSON.parse(value));
  const projection = projectThreadLinks({
    scope: current.scope,
    messages: current.messages,
    annotations: [...current.annotations, ...events],
    historyComplete: true,
    unavailableEventIds: current.unavailableEventIds,
  });
  ensure(projection.status === "complete", "prepared-projection-incomplete");
  for (const event of events) {
    const child = event.tags.find((tag) => tag[0] === "buzz-thread-child")?.[1];
    ensure(
      projection.heads.get(child) === event.id,
      "prepared-annotation-not-selected",
    );
  }
  return projection;
}
