# Work log bridge

`scripts/ideaflow/buzz-paseo worklog` publishes a private projection of tracked work. Top-level messages are major thrusts; task/query messages are replies to an existing major-thrust key. Status updates edit the same bridge-owned message through Buzz kind40003. Daily/weekly digests use separate stable period keys and can include a vetted summary and a verified private worklog-page link. This does not replace the worklog owner's canonical ledger or create a second collector.

The host deployment uses the existing task-scoped Paseo key and relay through `/home/dev/code/buzz-fork-20261115/buzz-fork`. It never reads a Mac key, changes a relay setting, or alters an original signed message. No new dependencies are installed. The source verifier uses the bridge's existing aged Schnorr library.

## Destination and commands

The verified private **Work log** channel is `c74a895c-7145-41e3-a701-fe2daa74e477`, with exactly Jacob and the root bridge. The local config/operation journal lives in `/home/dev/code/buzz-worklog-20261116/state`, mode0700/0600. Preserve it across updates: it binds canonical keys to exact event IDs and prevents duplicate posts. This directory is not a Buzz database.

```sh
buzz-paseo worklog post --key project:buzz --kind thrust --owner AGENT_UUID \
  --title 'Buzz improvements' --status progress
buzz-paseo worklog post --key canonicaltask:TASK_UUID --kind task \
  --parent-key project:buzz --owner AGENT_UUID --title 'Persist thread expansion' --status progress
buzz-paseo worklog update --key canonicaltask:TASK_UUID --status done
buzz-paseo worklog post --key day:2026-11-16 --kind daily --owner AGENT_UUID \
  --title 'Major thrusts · 16 November' --status done --summary-file VETTED_SUMMARY \
  --page-url VERIFIED_PRIVATE_PAGE_URL
```

`open` means unasserted/not started, `progress` means actually working, `waiting` means waiting on Jacob, and `done` is explicit semantic completion. Do not infer a task state from an agent being running or idle. Existing tasks can reopen through another explicit update. Owner/kind changes require a deliberate new mapping rather than silently changing the task's identity. `--summary-file` is allowed only for day/week digests; task posts remain one line. The publisher does not generate summaries or extract source message text.

An uncertain operation is not automatically retried. `worklog reconcile --key KEY` uses a saved exact acceptance ID. If the acceptance ID was lost, inspect the relay and use `--event EXACT_ID` explicitly; matching text is insufficient proof of operation identity. A missing/deleted message, outside edit, ambiguous recovery or non-current revision stops the operation. A failed update never becomes a new top-level message. New links use `buzz-ideaflow://message?channel=UUID&id=EVENT_ID`; canonical `buzz://` currently opens official Buzz on M5.

The first validation uses only the task-owned isolated Work log test channel with its own state directory. No DM rethreading or real task-status transitions are part of the smoke test. Recurring publication is not installed by this CLI. The worklog owner supplies an explicit audited postable feed/period summary; root can call these commands before the later feed integration is ready.

## Read-only source export, version1

The source allowlist is exactly the Jacob↔Paseo DM `ad66b837-7232-4fa0-b41f-cbc49d415b0b` and **Ops alerts** `53e03008-6a6b-4ba2-a67c-7085ac0e9253`. Work log is a projection destination and is excluded from ingestion to prevent feedback loops. Jacob's public key is `3eb6491e9fecd5e2c0221f76b79685a1478b591bf90ea155f5352ebe12672e1f`; the root bridge key is `38ba46f41d56ff5c71cfbfb856d00b209e6216a218260d2a30c4f1b712bdd1cb`.

`worklog export --classifications REVIEWED_V1.json --output-dir ABSOLUTE_DIRECTORY` reads signed events in memory, verifies their canonical hashes/BIP340 signatures, and writes only redacted metadata JSONL plus a coverage receipt. No message/reply body, prompt, attachment, key or transcript is archived. Classification labels are explicit vetted labels capped at140 characters, never automatic message excerpts. Raw unclassified messages are omitted and counted; a source transport snapshot is not exhaustive semantic task coverage. A coverage error leaves the previous export intact. Previously observed immutable metadata is retained when a later source query omits it.

`messages get` provides channel-bound kind9 history. The existing authenticated `POST /query` is used only for signed reactions/edits referencing those verified messages; valid reactions often have no `h` tag. Their scope is established through the verified target, without modifying signed tags. The read helper fixes the endpoint to the established relay, checks the existing private-key file's permissions in place, and never prints credentials. Pagination fails on a saturated same-second boundary instead of silently skipping records.

The first JSONL row is a coverage header:

```json
{"v":1,"kind":"coverage","channels":["DM_UUID","OPS_UUID"],"state":"complete","complete":true,"observed_at":"2026-11-17T00:00:00Z","since":"1970-01-01T00:00:00Z","until":"2026-11-17T00:00:00Z","metadataOnly":true,"bodyArchived":false,"exported":0,"explicit_classifications":0,"unclassified_jacob_messages":44,"limitation":"Reviewed classifications only; task starts require tasks[]."}
```

Following rows use `v`, `kind` (`ask`, `query`, `reply`, `status`, `revision`), actual signed `event_id`, `at`, `author`, `channel_id`, `provenance` (`jacob`/`root`), `ask_id` (the original classified source message), `thread_id`, `parent_id`, `origin_key`, `native_thread_id`, `native_parent_id`, `curated_thread_id`, `curated_parent_id`, and `tasks`. A revision has its actual kind40003 ID/time and `target_event_id`; it does not overwrite the original observation or initiate a task. Curated fields are null until reviewed thread annotations are implemented and applied. Native root-only tags do not establish a reply parent.

`origin_key` is `buzz:jprojects.communities.buzz.xyz:CHANNEL_UUID:ORIGINAL_SOURCE_ID`. It is context, not cross-source deduplication proof. `tasks` contains explicit annotations `{id:"canonicaltask:UUID",kind:"task"|"query",initiated:true|false,provenance:"manual"|"namespace",owner:"AGENT_UUID"}`. Several tasks may share one source event. Only the exact canonical task ID joins a Buzz observation to a Paseo task. Derived replies/status/revisions carry `initiated:false`; an empty array asserts no task start. Never substitute a hash/title/message ID for a native task UUID.

Root's signing key is also used by automation. Root replies require both a verified signed event and the existing listener's read-only `replies` ledger entry with `source=root,status=verified`. Legacy mutable `thread_status` rows and a matching emoji/time window do not prove that root created a reaction; those historical statuses are omitted. A future exact fresh-root-reaction journal may identify a real reaction event by ID. Absence of that journal is explicit unknown coverage, not fabricated activity. The adapter reads only provenance columns through SQLite `mode=ro`/`query_only`; it never writes the listener database or opens prompt files.

Implementation: `worklog_source.py`, `worklog_client.py`, `worklog_read.mjs`, `worklog_posts.py`; the worklog consumer is independently owned in `logbook/worklog/buzz.py`. Before production integration, test the exact emitted fixture against the consumer and preserve last-good behavior. Postable feed consumption, daily/weekly scheduling and native Mac link opening remain separately reported delivery steps.
