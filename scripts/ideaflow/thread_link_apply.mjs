import {
  isHex,
  ThreadLinkError,
  ensure,
  exactKeys,
  hash,
} from "./thread_link_common.mjs";
import {
  operationEvent,
  preparedProjection,
  validatePlan,
  verifyPlanSource,
} from "./thread_link_plan.mjs";
import {
  baselineDigest,
  readAnnotation,
  snapshot,
} from "./thread_link_snapshot.mjs";

export function reviewedPlan(bytes, expectedDigest) {
  ensure(
    Buffer.isBuffer(bytes) &&
      bytes.length <= 1024 * 1024 &&
      isHex(expectedDigest) &&
      hash(bytes) === expectedDigest,
    "reviewed-plan-digest-mismatch",
  );
  let plan;
  try {
    plan = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new ThreadLinkError("invalid-plan-json");
  }
  ensure(
    Buffer.from(`${JSON.stringify(plan, null, 2)}\n`).equals(bytes),
    "noncanonical-plan-bytes",
  );
  validatePlan(plan);
  return { plan, bytes, digest: expectedDigest };
}

function checkedJournal(
  journal,
  reviewed,
  fingerprint,
  requireFingerprint = true,
) {
  exactKeys(journal, [
    "version",
    "kind",
    "planDigest",
    "toolFingerprint",
    "registrationDigest",
    "channelId",
    "actorPubkey",
    "reviewedPlanBytes",
    "createdAt",
    "entries",
  ]);
  const { plan, digest, bytes } = reviewed;
  ensure(
    journal.version === 1 &&
      journal.kind === "buzz-thread-link-journal" &&
      journal.planDigest === digest &&
      hash(journal.reviewedPlanBytes) === digest &&
      journal.reviewedPlanBytes === bytes.toString("utf8") &&
      journal.actorPubkey === plan.actorPubkey &&
      journal.channelId === plan.channelId &&
      journal.registrationDigest === plan.registrationDigest &&
      journal.toolFingerprint === plan.toolFingerprint,
    "journal-manifest-mismatch",
  );
  if (requireFingerprint)
    ensure(journal.toolFingerprint === fingerprint, "tool-fingerprint-changed");
  ensure(
    Number.isSafeInteger(journal.createdAt) &&
      Array.isArray(journal.entries) &&
      journal.entries.length === plan.operations.length,
    "invalid-journal",
  );
  for (const [index, entry] of journal.entries.entries()) {
    exactKeys(entry, [
      "operationIndex",
      "eventId",
      "eventBytes",
      "state",
      "attempts",
      "relayAccepted",
      "projectionSelected",
      "lastCode",
      "lastAttemptAt",
      "verifiedAt",
    ]);
    ensure(
      entry.operationIndex === index &&
        entry.eventId === plan.operations[index].eventId &&
        entry.eventBytes === plan.operations[index].eventBytes &&
        [
          "prepared",
          "submitting",
          "uncertain",
          "relay-rejected",
          "verified",
          "conflict",
        ].includes(entry.state) &&
        Number.isSafeInteger(entry.attempts) &&
        entry.attempts >= 0 &&
        [null, true, false].includes(entry.relayAccepted) &&
        [null, true, false].includes(entry.projectionSelected) &&
        (entry.lastCode === null || /^[a-z-]{1,80}$/.test(entry.lastCode)) &&
        [entry.lastAttemptAt, entry.verifiedAt].every(
          (value) => value === null || Number.isSafeInteger(value),
        ),
      "invalid-journal",
    );
    operationEvent(plan, plan.operations[index]);
  }
  return journal;
}

function initialJournal(reviewed, now) {
  const { plan, digest, bytes } = reviewed;
  return {
    version: 1,
    kind: "buzz-thread-link-journal",
    planDigest: digest,
    toolFingerprint: plan.toolFingerprint,
    registrationDigest: plan.registrationDigest,
    channelId: plan.channelId,
    actorPubkey: plan.actorPubkey,
    reviewedPlanBytes: bytes.toString("utf8"),
    createdAt: now,
    entries: plan.operations.map((operation, operationIndex) => ({
      operationIndex,
      eventId: operation.eventId,
      eventBytes: operation.eventBytes,
      state: "prepared",
      attempts: 0,
      relayAccepted: null,
      projectionSelected: null,
      lastCode: null,
      lastAttemptAt: null,
      verifiedAt: null,
    })),
  };
}

function sameEvent(event, expected) {
  return (
    JSON.stringify([
      event.id,
      event.pubkey,
      event.created_at,
      event.kind,
      event.tags,
      event.content,
      event.sig,
    ]) ===
    JSON.stringify([
      expected.id,
      expected.pubkey,
      expected.created_at,
      expected.kind,
      expected.tags,
      expected.content,
      expected.sig,
    ])
  );
}

function noUnresolvedOtherIntent(store, reviewed) {
  for (const other of store.otherJournals(reviewed.digest)) {
    ensure(
      typeof other.reviewedPlanBytes === "string" && isHex(other.planDigest),
      "invalid-existing-journal",
    );
    const prior = reviewedPlan(
      Buffer.from(other.reviewedPlanBytes),
      other.planDigest,
    );
    checkedJournal(other, prior, other.toolFingerprint, false);
    if (
      prior.plan.channelId !== reviewed.plan.channelId ||
      prior.plan.actorPubkey !== reviewed.plan.actorPubkey
    )
      continue;
    const requested = new Set(
      reviewed.plan.operations.map((operation) => operation.childEventId),
    );
    for (const entry of other.entries) {
      if (
        !requested.has(prior.plan.operations[entry.operationIndex].childEventId)
      )
        continue;
      const neverAttempted = entry.state === "prepared" && entry.attempts === 0;
      if (
        neverAttempted ||
        (entry.state === "relay-rejected" && entry.relayAccepted === false)
      )
        continue;
      ensure(
        ["verified", "conflict"].includes(entry.state) &&
          entry.relayAccepted === true,
        "unresolved-previous-plan",
      );
      ensure(
        reviewed.plan.snapshot.annotationIds.includes(entry.eventId),
        "published-previous-plan-not-reviewed",
      );
    }
  }
}

function report(journal) {
  return {
    planDigest: journal.planDigest,
    channelId: journal.channelId,
    uiVerified: false,
    operations: journal.entries.map(
      ({
        operationIndex,
        eventId,
        state,
        relayAccepted,
        projectionSelected,
        attempts,
        lastCode,
      }) => ({
        operationIndex,
        eventId,
        state,
        relayAccepted,
        projectionSelected,
        attempts,
        lastCode,
      }),
    ),
  };
}

/** No event is sent before the entire exact approved wire manifest is durable. */
export async function applyPlan({
  client,
  store,
  bytes,
  expectedDigest,
  fingerprint,
}) {
  const reviewed = reviewedPlan(bytes, expectedDigest);
  const { plan, digest } = reviewed;
  ensure(
    plan.actorPubkey === client.actorPubkey,
    "plan-identity-scope-mismatch",
  );
  ensure(plan.toolFingerprint === fingerprint(), "tool-fingerprint-changed");
  ensure(
    plan.operations.every(
      (operation) => operation.eligibility === "self-author",
    ),
    "not-child-author",
  );
  return store.lock(digest, async (locked) => {
    let journal = locked.read();
    const ownIds = new Set(
      plan.operations.map((operation) => operation.eventId),
    );
    if (journal) checkedJournal(journal, reviewed, fingerprint());
    else {
      noUnresolvedOtherIntent(store, reviewed);
      const current = await snapshot(client, plan.channelId);
      verifyPlanSource(
        plan,
        client,
        current,
        fingerprint(),
        baselineDigest(current, ownIds),
      );
      preparedProjection(
        current,
        plan.operations.map((operation) => operation.eventBytes),
      );
      ensure(
        plan.operations.every(
          (operation) =>
            Math.abs(
              client.now() - operationEvent(plan, operation).created_at,
            ) <= 900,
        ),
        "signed-event-expired",
      );
      journal = initialJournal(reviewed, client.now());
      locked.save(journal);
    }
    for (const entry of journal.entries) {
      const operation = plan.operations[entry.operationIndex];
      const expected = operationEvent(plan, operation);
      let actual = await readAnnotation(client, plan.channelId, entry.eventId);
      if (!actual) {
        ensure(entry.state !== "verified", "verified-annotation-unavailable");
        ensure(
          entry.state !== "relay-rejected" && entry.state !== "conflict",
          "terminal-journal-entry",
        );
        noUnresolvedOtherIntent(store, reviewed);
        const current = await snapshot(client, plan.channelId);
        verifyPlanSource(
          plan,
          client,
          current,
          fingerprint(),
          baselineDigest(current, ownIds),
        );
        ensure(
          (current.projection.heads.get(operation.childEventId) ?? null) ===
            operation.expectedHead,
          "expected-head-changed",
        );
        preparedProjection(
          current,
          plan.operations.map((row) => row.eventBytes),
        );
        ensure(
          Math.abs(client.now() - expected.created_at) <= 900,
          "signed-event-expired",
        );
        entry.state = "submitting";
        entry.attempts++;
        entry.lastAttemptAt = client.now();
        entry.lastCode = null;
        locked.save(journal);
        try {
          const accepted = await client.submit(entry.eventBytes);
          ensure(
            accepted.eventId === entry.eventId &&
              typeof accepted.accepted === "boolean",
            "submit-uncertain",
          );
          entry.relayAccepted = accepted.accepted;
          if (!accepted.accepted) {
            entry.state = "relay-rejected";
            entry.lastCode = "relay-rejected";
            locked.save(journal);
            return report(journal);
          }
          locked.save(journal);
          actual = await readAnnotation(client, plan.channelId, entry.eventId);
          ensure(actual, "readback-unavailable");
        } catch (error) {
          entry.state = "uncertain";
          entry.lastCode =
            error instanceof ThreadLinkError
              ? error.code
              : "transport-uncertain";
          locked.save(journal);
          return report(journal);
        }
      }
      ensure(sameEvent(actual, expected), "saved-event-mismatch");
      entry.relayAccepted = true;
      try {
        const current = await snapshot(client, plan.channelId);
        ensure(
          plan.snapshot.messageIds.every((id) =>
            current.summary.messageIds.includes(id),
          ),
          "reviewed-original-unavailable",
        );
        entry.projectionSelected =
          current.projection.heads.get(operation.childEventId) ===
          entry.eventId;
        entry.state = entry.projectionSelected ? "verified" : "conflict";
        entry.lastCode = entry.projectionSelected
          ? null
          : "accepted-not-selected";
        entry.verifiedAt = client.now();
        locked.save(journal);
        if (!entry.projectionSelected) return report(journal);
      } catch (error) {
        entry.state = "uncertain";
        entry.projectionSelected = null;
        entry.lastCode =
          error instanceof ThreadLinkError
            ? error.code
            : "verification-unavailable";
        locked.save(journal);
        return report(journal);
      }
    }
    return report(journal);
  });
}

/** Read-only reconciliation; it neither adopts hashes nor updates a journal. */
export async function verifyPlan({
  client,
  store,
  bytes,
  expectedDigest,
  fingerprint,
}) {
  const reviewed = reviewedPlan(bytes, expectedDigest);
  const { plan } = reviewed;
  ensure(
    plan.actorPubkey === client.actorPubkey,
    "plan-identity-scope-mismatch",
  );
  const journal = store.read(expectedDigest);
  if (journal) checkedJournal(journal, reviewed, fingerprint(), false);
  const current = await snapshot(client, plan.channelId);
  const operations = [];
  for (const [index, operation] of plan.operations.entries()) {
    ensure(operation.eligibility === "self-author", "not-child-author");
    const expected = operationEvent(plan, operation);
    const actual = await readAnnotation(
      client,
      plan.channelId,
      operation.eventId,
    );
    if (actual) ensure(sameEvent(actual, expected), "saved-event-mismatch");
    operations.push({
      operationIndex: index,
      eventId: operation.eventId,
      relayAccepted: Boolean(actual),
      projectionSelected:
        Boolean(actual) &&
        current.projection.heads.get(operation.childEventId) ===
          operation.eventId,
    });
  }
  return {
    planDigest: expectedDigest,
    channelId: plan.channelId,
    journalPresent: Boolean(journal),
    toolFingerprintMatches: plan.toolFingerprint === fingerprint(),
    uiVerified: false,
    reviewedOriginalsVerified: plan.snapshot.messageIds.every((id) =>
      current.summary.messageIds.includes(id),
    ),
    operations,
  };
}
