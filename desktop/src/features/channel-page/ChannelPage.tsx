import * as React from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { relayClient } from "@/shared/api/relayClient";
import type { RelayEvent } from "@/shared/api/types";
import { useUserProfileQuery } from "@/features/profile/hooks";
import { Button } from "@/shared/ui/button";
import { pageHead, validatePage } from "./model";
import { pageFilter, setPage } from "./service";
import { pageDocument, pageExternalLink } from "./sandbox";

/** Pane-ready content: scope and lifetime belong to the containing view instance. */
export function ChannelPage({
  channelId,
  canEdit,
  onClose,
}: {
  channelId: string;
  canEdit: boolean;
  onClose?: () => void;
}) {
  const editorId = React.useId();
  const [head, setHead] = React.useState<RelayEvent | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState("");
  const [draft, setDraft] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [external, setExternal] = React.useState<string | null>(null);
  const [tick, setTick] = React.useState(0);
  const frame = React.useRef<HTMLIFrameElement>(null);
  const generation = React.useRef(0);
  const profile = useUserProfileQuery(head?.pubkey).data;
  React.useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(timer);
  }, []);
  React.useEffect(() => {
    const version = ++generation.current;
    let stop: (() => void) | undefined;
    const controller = new AbortController();
    setHead(null);
    setLoaded(false);
    setError("");
    setDraft(null);
    setSaving(false);
    setExternal(null);
    const accept = (event: RelayEvent) => {
      if (generation.current === version)
        setHead((old) => pageHead(old ? [old, event] : [event], channelId));
    };
    // Subscribe before history; merge by deterministic order so late history cannot erase a live edit.
    void relayClient
      .subscribeLive(
        pageFilter(channelId),
        accept,
        undefined,
        undefined,
        controller.signal,
      )
      .then((unsubscribe) => {
        if (generation.current !== version) unsubscribe();
        else stop = unsubscribe;
      })
      .catch((e) => {
        if (generation.current === version) setError(String(e));
      });
    void relayClient
      .fetchEvents(pageFilter(channelId))
      .then((events) => {
        if (generation.current !== version) return;
        for (const event of events) accept(event);
        setLoaded(true);
      })
      .catch((e) => {
        if (generation.current === version) setError(String(e));
      });
    return () => {
      generation.current++;
      controller.abort();
      stop?.();
    };
  }, [channelId]);
  React.useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        event.source !== frame.current?.contentWindow ||
        event.data?.type !== "buzz-page-link"
      )
        return;
      setExternal(pageExternalLink(event.data.href));
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);
  const save = async () => {
    if (draft === null || saving || !canEdit) return;
    const version = generation.current;
    setSaving(true);
    setError("");
    try {
      validatePage(draft);
      const event = await setPage(channelId, draft, head?.created_at);
      if (generation.current === version) {
        setHead((old) => pageHead(old ? [old, event] : [event], channelId));
        setDraft(null);
      }
    } catch (e) {
      if (generation.current === version) setError(String(e));
    } finally {
      if (generation.current === version) setSaving(false);
    }
  };
  const age = head
    ? Math.max(0, Math.floor((Date.now() / 1000 - head.created_at) / 60))
    : 0;
  void tick;
  return (
    <section
      className="flex min-h-0 flex-1 flex-col gap-3"
      aria-label="Channel Page"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 flex-1 break-all text-xs text-muted-foreground">
          {head
            ? `Updated ${age < 1 ? "just now" : age < 60 ? `${age}m ago` : age < 1440 ? `${Math.floor(age / 60)}h ago` : `${Math.floor(age / 1440)}d ago`} by ${profile?.displayName || head.pubkey}`
            : "One shared HTML Page for this conversation"}
        </span>
        {canEdit && loaded && draft === null ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setDraft(
                head?.content ??
                  "<!doctype html><html><body><h1>Page</h1></body></html>",
              )
            }
          >
            {head ? "Edit HTML" : "Create Page"}
          </Button>
        ) : null}
        {onClose ? (
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {draft !== null ? (
        <>
          <label htmlFor={editorId} className="text-sm">
            Self-contained HTML · 512 KiB maximum
          </label>
          <textarea
            id={editorId}
            className="min-h-80 flex-1 rounded border bg-background p-3 font-mono text-sm"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={saving}
          />
          <div className="flex gap-2">
            <Button disabled={saving} onClick={() => void save()}>
              {saving ? "Saving…" : "Save Page"}
            </Button>
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => setDraft(null)}
            >
              Cancel
            </Button>
          </div>
        </>
      ) : head ? (
        <iframe
          ref={frame}
          title="Channel Page HTML"
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          srcDoc={pageDocument(head.content)}
          className="min-h-96 w-full flex-1 border-0 bg-white"
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          {loaded
            ? "No Page yet. Publish one here or with buzz page set."
            : "Loading Page…"}
        </p>
      )}
      {external ? (
        <div className="flex items-center gap-2 text-sm">
          <span className="min-w-0 flex-1 break-all">{external}</span>
          <Button
            size="sm"
            onClick={() => {
              void openUrl(external).catch((e) => setError(String(e)));
              setExternal(null);
            }}
          >
            Open externally
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setExternal(null)}>
            Dismiss
          </Button>
        </div>
      ) : null}
    </section>
  );
}
