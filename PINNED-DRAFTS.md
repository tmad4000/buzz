# Pinned-message drafts for root to post

Prepared from Fable's 2026-11-18 design. Do not auto-post. Root must choose the existing Paseo/Hermes DMs, verify identity/audience, publish/pin via the established writer, and read back. No P2 rename or posting is requested by this handoff.

## Paseo DM

**Where I run / how to resume me**

I run on GCP (`jacob-dev-1`) through the Buzz listener. This DM reaches Jacob's orchestrator, Paseo session `d3caa262-cdcd-454d-9d42-0cd05ac69156`.

[Open in Paseo ↗](paseo://h/srv_KIFHQ_zsBnI2/agent/d3caa262-cdcd-454d-9d42-0cd05ac69156)

If the link cannot open, use Paseo's paired GCP host and open that session. CLI fallback: `paseo attach d3caa262-cdcd-454d-9d42-0cd05ac69156 --host <your GCP alias>`. Replace the placeholder with your paired host alias. P2 reaches the same orchestrator; its name is unchanged.

## Hermes DM

**Where I run / how to resume me**

I run on the M4 as a Buzz ACP agent managed by launchd, not Herdr. My daemon is `com.buzz.hermes-agent`; I do not have a single Paseo session to reopen.

To restart me, run this **on the M4**:

```sh
launchctl kickstart -k gui/$(id -u)/com.buzz.hermes-agent
```

To follow my log, run this **on the M4**:

```sh
tail -f ~/.buzz/logs/hermes-agent.log
```

Buzz re-establishes my ACP session on the next message if needed. My delegated workers are separate Paseo sessions on M4; restarting my daemon does not stop those workers. Their individual Paseo links belong with the work they perform.

**Root verification before pinning:** the M4 launchd label, paths and reconnect behavior above are reported by M4 owner9d75a0f, not verified from this cloud task. Have the M4 owner confirm them before posting as current operational instructions.
