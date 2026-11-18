# Direct agents label: production-path red/green evidence

Root requested lowest-legacy-stamp arrival permutations, authored rename-back, modern protection, two-device convergence and production codec/store/persistence coverage. The approved stamp-1 alternative cannot satisfy the lowest local-cache case; the independently reviewed display-only product implementation is retained unchanged.

Run from this worktree: `python3 validation/check-label-red-green.py`.

The runner loads the historical production upgrade function from committed83d1462c1, and a second copy with only the proposed successor changed to `[1, LEGACY_DEV, "Direct agents"]`. It substitutes each into the same bootstrap callback used by the new regression. The production decoder, merge, LaneStore constructor, persistence/reload and assertions are identical across cases. It changes no product files and relaxes no generic merge policy. Each Node invocation has its own process group,30-second deadline and whole-group cleanup.

Observed sequential results:

| Bootstrap writer | Exit | Required delayed authored cache result |
| --- | --- | --- |
| Historical83d1462c1 production upgrade | 1 (RED) | `legacy stamp1, arrivalafter`: expected A; actual Direct agents |
| Proposed stamp1/LEGACY successor | 1 (RED) | `legacy stamp1, arrivalafter`: expected A; actual Direct agents |
| Current unchanged-seed/display-only path | 0 (GREEN) | All three production-pipeline tests pass |

This is a genuine stamp-1 tie: the production LaneStore constructor decodes a real meta-less local-cache payload to version1/LEGACY_DEV. The proposed stored successor uses that same version/device, so the existing lexical tie-breaker lets Direct agents beat A. The current display-only path imports only original version0 seed registers; that cache's authored name wins before or after bootstrap without changing any merge policy. The synthetic relay variant uses the decoder's first positive event second1 → version1000; this demonstrates the timestamp conversion, not real relay acceptance of an ancient event.

The new committed tests cover:

- Names A, My authored agents and Paseo, each with actual constructor-decoded cache1 and relay-second1 documents, arriving before/after bootstrap, through LaneStore merge, persistence, reload and repeated bootstrap.
- Genuine modern edits, including away/back to exactly Paseo, preserved after bootstrap/reload and later legacy heads. Other untouched baseline fields may legitimately ingest remote data; the authored name register is the protection assertion.
- Two independent device stores bootstrap concurrently, exchange actual encodeDoc/decodeDoc relay documents in both directions, and repeatedly reload/bootstrap. Both retain identical original stored bytes while displaying Direct agents. A subsequent authored rename-back to Paseo converges identically on both, with no label/state flip-flop.
- Every display call asserts encoded byte immutability.

Local run logs: `/tmp/buzz-label-regression-20261118/label-{historical,stamp1,display}.log`. The runner recreates them for independent reproduction. Existing earlier production delayed200000 matrix remains in jacobChannelSectionDefaults.test.mjs.

Final full focused run: typecheck PASS;40/40 tests PASS, each test suite under the existing120s/60s process-group deadlines. New-file Biome and diff whitespace PASS. Owner36ce confirmed the exact test/evidence diff before push. Product source remains byte-identical to independently reviewed18f8599a.
