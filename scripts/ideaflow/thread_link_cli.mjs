import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";

import {
  DM,
  isHex,
  UUID,
  ThreadLinkError,
  ensure,
  fail,
  hash,
} from "./thread_link_common.mjs";
import {
  createClient,
  loadPaseoKey,
  loadRegistration,
  privateBytes,
} from "./thread_link_transport.mjs";
import { snapshot } from "./thread_link_snapshot.mjs";
import { buildPlan, toolFingerprint } from "./thread_link_plan.mjs";
import { applyPlan, reviewedPlan, verifyPlan } from "./thread_link_apply.mjs";
import { journalStore, writePlan } from "./thread_link_journal.mjs";

export const HELP = {
  commands: [
    "thread-links link CHILD --parent PARENT --dry-run [--channel UUID] [--out PLAN.json]",
    "thread-links unlink CHILD --dry-run [--channel UUID] [--out PLAN.json]",
    "thread-links plan --operations OPS.json [--channel UUID] [--out PLAN.json]",
    "thread-links apply PLAN.json --expected-digest SHA256",
    "thread-links verify PLAN.json --expected-digest SHA256",
  ],
  liveWrites:
    "Only apply publishes; invoke only after independent review and root approval of the exact plan digest.",
  ui: "Publisher only; no thread UI migration is claimed.",
};

/** Parse the narrow command surface before touching any identity or network. */
export function parseArgs(argv) {
  if (argv.includes("--help") || argv[0] === "help") return { command: "help" };
  const [command, ...rest] = argv;
  const allowed = {
    link: ["--parent", "--channel", "--out", "--dry-run"],
    unlink: ["--channel", "--out", "--dry-run"],
    plan: ["--channel", "--operations", "--out"],
    apply: ["--expected-digest"],
    verify: ["--expected-digest"],
  };
  ensure(Object.hasOwn(allowed, command), "invalid-command");
  const options = {};
  const positional = [];
  for (let index = 0; index < rest.length; index++) {
    const item = rest[index];
    if (!item.startsWith("--")) {
      positional.push(item);
      continue;
    }
    ensure(
      allowed[command].includes(item) && !Object.hasOwn(options, item),
      "invalid-option",
    );
    if (item === "--dry-run") options[item] = true;
    else {
      const value = rest[++index];
      ensure(value && !value.startsWith("--"), "missing-option-value");
      options[item] = value;
    }
  }
  ensure(
    positional.length === (command === "plan" ? 0 : 1),
    "invalid-positional-arguments",
  );
  if (command === "apply" || command === "verify") {
    ensure(
      isHex(options["--expected-digest"] ?? ""),
      "expected-digest-required",
    );
    return {
      command,
      file: positional[0],
      expectedDigest: options["--expected-digest"],
    };
  }
  const channel = options["--channel"] ?? DM;
  ensure(UUID.test(channel), "invalid-channel");
  if (command === "plan")
    ensure(options["--operations"], "operations-file-required");
  else
    ensure(
      isHex(positional[0]) &&
        options["--dry-run"] === true &&
        (command !== "link" || isHex(options["--parent"] ?? "")),
      "dry-run-and-ids-required",
    );
  return {
    command,
    channel,
    child: positional[0] ?? null,
    parent: options["--parent"] ?? null,
    operationsFile: options["--operations"] ?? null,
    out: options["--out"] ?? null,
  };
}

function jsonFile(file) {
  try {
    return JSON.parse(privateBytes(file, 1024 * 1024).toString("utf8"));
  } catch (error) {
    if (error instanceof ThreadLinkError) throw error;
    fail("input-file-unavailable-or-invalid");
  }
}

/** Dependency injection is for tests; the executable has no endpoint/key override. */
export async function executeCommand(command, { client, store, fingerprint }) {
  if (command.command === "help") return HELP;
  if (command.command === "apply" || command.command === "verify") {
    const bytes = privateBytes(command.file, 1024 * 1024);
    return (command.command === "apply" ? applyPlan : verifyPlan)({
      client,
      store,
      bytes,
      expectedDigest: command.expectedDigest,
      fingerprint,
    });
  }
  const operations =
    command.command === "plan"
      ? jsonFile(command.operationsFile)
      : [
          {
            operation: command.command,
            childEventId: command.child,
            parentEventId: command.parent,
            confidence: "explicit",
          },
        ];
  const current = await snapshot(client, command.channel);
  const plan = buildPlan(client, current, operations, fingerprint());
  const bytes = Buffer.from(`${JSON.stringify(plan, null, 2)}\n`);
  if (command.out) writePlan(command.out, bytes);
  return {
    dryRun: true,
    planDigest: hash(bytes),
    toolFingerprint: plan.toolFingerprint,
    path: command.out,
    plan,
  };
}

async function main() {
  process.umask(0o077);
  const command = parseArgs(process.argv.slice(2));
  if (command.command === "help") {
    process.stdout.write(`${JSON.stringify(HELP)}\n`);
    return;
  }
  ensure(process.platform === "linux", "gcp-linux-only");
  let channel = command.channel;
  if (command.command === "apply" || command.command === "verify") {
    channel = reviewedPlan(
      privateBytes(command.file, 1024 * 1024),
      command.expectedDigest,
    ).plan.channelId;
  }
  const now = Math.floor(Date.now() / 1000);
  const registration = loadRegistration(channel, now);
  const key = loadPaseoKey();
  try {
    const client = createClient(key, registration);
    const store = journalStore(
      path.join(os.homedir(), ".local/state/buzz-thread-links"),
    );
    const result = await executeCommand(command, {
      client,
      store,
      fingerprint: toolFingerprint,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (
      command.command === "apply" &&
      result.operations.some((operation) => operation.state !== "verified")
    )
      process.exitCode = 2;
    if (
      command.command === "verify" &&
      (!result.reviewedOriginalsVerified ||
        result.operations.some(
          (operation) =>
            !operation.relayAccepted || !operation.projectionSelected,
        ))
    )
      process.exitCode = 3;
  } finally {
    key.fill(0);
  }
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  main().catch((error) => {
    const code =
      error instanceof ThreadLinkError && /^[a-z-]{1,80}$/.test(error.code)
        ? error.code
        : "thread-link-operation-failed";
    process.stderr.write(`${JSON.stringify({ error: code })}\n`);
    process.exitCode = 1;
  });
}
