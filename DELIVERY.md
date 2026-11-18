# Last advertised route — small .9 follow-up

Root requested explicit route-advertisement freshness on runtime rows/profiles, stacked on frozen PR81 7998e81a88134a03f578175c29eed20daecef5e0. Jacob's original Direct Agents ask distinguishes where an agent runs/how to resume it; a self-signed route is not presence or execution proof.

Changes: shared Last advertised route label, relative age, STALE · stale, may be offline strictly after five minutes, retained Stale (over 24 h) strictly after24h. Existing visibility-aware shared minute clock, clamped future timestamps. Runtime rows have a bounded-width wrapped badge and additive auto/minimum row height when data-runtime-route exists; no runtime data leaves row height unchanged. No section names/order/Starred/assignments, producer, query/signature/opener, presence or PR81 edits. Sidebar owner36ce8949 received exact additive diff before PR. Existing device-local runtime-card switch remains default OFF.

Tests: 11/11 focused runtime/model/UI PASS, including fake timers driving the actual useNow React shared clock, exact5min vs over5min, 2m age, over24h, future clamp, and row/profile timestamp bindings. TypeScript tsc --noEmit PASS. Processes start_new_session with60s/150s deadlines and process-group cleanup; logs /tmp/runtime-route-age-focused.log and /tmp/runtime-route-age-typecheck.log. git diff --check PASS. No dependency/install/browser/native/Cargo/Mac/live-publication activity. No native or authenticated UI acceptance claim.

Review: draft stacked PR, independent Sol dispatch and .9 rollup through coordinator a036208f-259f-46f1-9689-dba3d08e3805. Native/human acceptance remains separately scoped.
