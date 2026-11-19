import { FleetIndicatorPreference } from "@/features/agent-fleet/FleetStatusButton";
import { AgentQueuePanel } from "@/features/agent-queue/AgentQueueView";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { copyTextToClipboard } from "@/shared/lib/clipboard";
import { RuntimeRouteAge } from "./RuntimeRouteAge";
import { runtimeSessionLink, type RuntimeSession } from "./model";
import { setRuntimeCardsEnabled, useRuntimeCardsEnabled } from "./preference";
import { useAgentRuntime } from "./useAgentRuntime";

export function OpenRuntimeSession({ session }: { session: RuntimeSession }) {
  const link = runtimeSessionLink(session);
  return link ? (
    <button
      type="button"
      className="text-xs text-primary underline underline-offset-4"
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onClick={() => {
        void openUrl(link).catch(() => toast.error("Failed to open Paseo"));
      }}
    >
      Open in Paseo ↗
    </button>
  ) : null;
}

/** Self-attestation is provenance, not proof that the process is healthy. */
export function AgentRuntimeCard({ pubkey }: { pubkey: string }) {
  const enabled = useRuntimeCardsEnabled();
  const query = useAgentRuntime(pubkey);
  const data = query.data;
  return (
    <section
      className="my-3 rounded-lg border p-3 text-sm"
      aria-label="Agent runtime"
    >
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            try {
              setRuntimeCardsEnabled(e.target.checked);
            } catch {
              toast.error("Could not save runtime card preference");
            }
          }}
        />
        Show agent runtime cards (this device)
      </label>
      {enabled && query.isError ? (
        <p role="status">
          Runtime card unavailable.{" "}
          <button type="button" onClick={() => void query.refetch()}>
            Retry
          </button>
        </p>
      ) : null}
      {enabled && !data && !query.isError ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {query.isPending
            ? "Loading runtime card…"
            : "No self-signed runtime card published."}
        </p>
      ) : null}
      {data ? (
        <div className="mt-3">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
            <dt>Host</dt>
            <dd>{data.card.host.toUpperCase()}</dd>
            {data.card.runtime ? (
              <>
                <dt>Runtime</dt>
                <dd>{data.card.runtime}</dd>
              </>
            ) : null}
            {data.card.session ? (
              <>
                <dt>Session</dt>
                <dd>
                  <OpenRuntimeSession session={data.card.session} />
                </dd>
              </>
            ) : null}
            {data.card.logs ? (
              <>
                <dt>Logs</dt>
                <dd className="break-all font-mono text-xs">
                  {data.card.logs}
                </dd>
              </>
            ) : null}
          </dl>
          {data.card.resume?.length ? (
            <details className="mt-3">
              <summary className="cursor-pointer">Resume</summary>
              <p className="my-2 text-xs text-muted-foreground">
                Copy these instructions to run on the agent’s host.
              </p>
              {data.card.resume.map((r) => (
                <div key={`${r.label}:${r.command}`} className="my-2">
                  <div className="text-xs">{r.label}</div>
                  <code className="block whitespace-pre-wrap break-all text-xs">
                    {r.command}
                  </code>
                  <button
                    type="button"
                    className="text-xs underline"
                    aria-label={`Copy ${r.label}`}
                    onClick={() =>
                      copyTextToClipboard(
                        r.command,
                        "Resume instruction copied",
                      )
                    }
                  >
                    Copy
                  </button>
                </div>
              ))}
            </details>
          ) : null}
          {data.card.delegates?.map((d) => (
            <div key={`${d.serverId}:${d.agentId}`} className="mt-2 text-xs">
              {d.label} · <OpenRuntimeSession session={d} />
            </div>
          ))}
          <p className="mt-3 text-xs text-muted-foreground">
            <RuntimeRouteAge attestedAt={data.attestedAt} />
            <br />
            Self-signed · self-reported{" "}
            {new Date(data.attestedAt * 1000).toLocaleString()}
            {query.isError ? " · Refresh failed" : ""}
          </p>
        </div>
      ) : null}
      <AgentQueuePanel pubkey={pubkey} />
      <FleetIndicatorPreference pubkey={pubkey} />
    </section>
  );
}
