# Direct agents (Ideaflow .9 candidate)

Jacob asked on 2026-11-17 at 22:49Z and 23:41Z to replace the vendor-specific sidebar section label, place direct agent conversations there, and make each agent's location and resume route accessible. He requested Fable's design perspective and Sol's implementation. Decisions 1, 3, 4 from Fable's 2026-11-18 design are approved. P2 naming/semantics remain unchanged.

## Reader

Open an agent profile and enable **Show agent runtime cards (this device)**. The device-local preference defaults off. The reader fetches at most one kind-30078 `d=agent-runtime` event per agent author, with focused polling every minute and normal reconnect invalidation. It renders a host chip and a keyboard-accessible Open in Paseo action on a one-agent DM row, and Host/Runtime/Session/Resume/Logs/delegates on the profile. Missing cards invent no host or session. Resume commands are inert text with Copy controls. A self-signature proves authorship, not process health; timestamps are labelled self-reported, and cards older than 24 hours appear muted/stale.

Agent cards are global per community, like profiles. Do not publish secrets, hostnames, credentials or private channel membership in them. Only a known agent participant's own signing key is used to look up a DM row card. Channel-scoped metadata is not a source of card authority. Profile cards use that profile's key. Actor tags never override signatures.

The reviewed native opener commits 7472d44a and b04b419e are included as two separate prerequisite cherry-picks. Runtime links further restrict the TS path to the same three exact paired server IDs as the native capability. Host/session mismatches are rejected. Query/hash/extra-path routes are rejected.

The Jacob-only encrypted bootstrap loader imports the unchanged original stamp-zero seed. A view-only projection displays Direct agents solely for the exact untouched seed section ID and entire Paseo node. It never writes a renamed register or advances a stamp; any authored section field, including a rename back to Paseo, retains the stored name. Generic merge semantics are unchanged. No section IDs, membership, order, Starred sources, P2 channel name or forwarding contract change. Adding Hermes/Buzz DM membership requires the existing private seed owner/device workflow; this PR does not invent identity/channel IDs or mutate Jacob's live preferences.

## Writer contract and owner integration

`desktop/src/features/agent-runtime/model.ts` exports `runtimeCardTemplate(card, createdAt)`. Sign that returned template with the agent's existing keypair, then publish through its existing authenticated relay client. Do not sign on behalf of the agent using Jacob's key. The payload is bounded to 16 KiB, 8 resume instructions and 16 delegates. `host` is required; all other fields are optional. Deleting/withdrawing fields requires replacing the whole card. An invalid newest signed card hides the previous card, preventing obsolete session links from resurfacing.

Paseo bridge owner 075fe138 should publish on startup and the existing health tick, after confirming server/session identity read-only:

```json
{
  "host": "gcp",
  "runtime": "Paseo root via Buzz listener",
  "session": {
    "serverId": "srv_KIFHQ_zsBnI2",
    "agentId": "d3caa262-cdcd-454d-9d42-0cd05ac69156"
  },
  "updatedAt": 1794978000
}
```

Use the actual verification timestamp, not the example timestamp. A runtime without a session omits `session` entirely. For Hermes on M4, the launcher owner should sign its own card at startup with `host: "m4"`, runtime `hermes-acp under Buzz launchd`, logs `~/.buzz/logs/hermes-agent.log`, and:

```json
{
  "resume": [
    {
      "label": "Restart Hermes on M4",
      "command": "launchctl kickstart -k gui/$(id -u)/com.buzz.hermes-agent"
    },
    {
      "label": "Follow Hermes logs on M4",
      "command": "tail -f ~/.buzz/logs/hermes-agent.log"
    }
  ]
}
```

That snippet is a field fragment, not a complete card. Include actual delegated workers only after verifying their UUIDs. Hermes stays a launchd daemon, without a fabricated Paseo session or Herdr migration. The M4 label/paths are reported by the existing M4 owner; verify them there before publication. No M4 bridge access or deployment is included in this source PR.

## Acceptance (release-owner slot)

1. On the candidate app enable the profile setting. Publish a synthetic agent-signed fixture via the existing test relay, then open a DM with that agent. Confirm its host and Open in Paseo action, using pointer and keyboard. The action opens the paired session without changing Buzz selection.
2. Open the profile. Confirm Runtime/Host/Session and copy instructions. Confirm a daemon card offers Resume and no primary session action; a delegate has its own link.
3. Replace the event, change its host/session together, and verify the next focused refresh. Verify malformed/foreign signatures do not display and a missing card has no invented values. Mark timestamps stale and verify the stale label.
4. Disable the setting. Cards and row affordances disappear. Switch community/identity and confirm no prior-community data appears.
5. Verify Jacob's untouched default section reads Direct agents; rename/edit/delete it, sync a second device, and confirm those edits survive. P2 remains unchanged.

Source/typecheck/unit tests do not verify macOS handler registration, live relay publication, native layout or human acceptance. Those remain release-captain gates. No dependencies, lockfiles, release versions or new relay kinds are introduced.

Sidebar composition follow-up: the runtime sibling actions reserve `right-14`, leaving PR46's `right-6` Star toggle in a separate slot. Sidebar owner36ce8949 approved the seed-only rename guard and this positional reservation. Exact native narrow-row/focus/hit-target acceptance remains captain-scoped. A captain-authorized single M5 status lookup at2026-11-18T06:31:07Z failed without a server ID; the M5 allowlist value remains unverified live and no retry is authorized.


Independent P1 correction: the label is now display-only, superseding all stored successor/placeholder approaches. Production-function regressions cover the reviewer's delayed legacy rename, local-cache versions1/2 and remote200000, both arrival orders, rename back to Paseo and persistence/reload; projection leaves encoded storage unchanged. Exact-head source re-review is required.
