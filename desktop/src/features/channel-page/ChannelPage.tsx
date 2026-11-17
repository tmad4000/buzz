import { usePageAuthors } from "./usePageAuthors";
import * as React from "react";
import { toast } from "sonner";
import { useConversationLeaveGuard } from "@/features/conversations/ConversationViewGuards";
import { openUrl } from "@tauri-apps/plugin-opener";
import { relayClient } from "@/shared/api/relayClient";
import type { RelayEvent } from "@/shared/api/types";
import { useUserProfileQuery } from "@/features/profile/hooks";
import { Button } from "@/shared/ui/button";
import { pageHead, validatePage } from "./model";
import { pageFilter, setPage, getPageHtml } from "./service";
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
  const [html, setHtml] = React.useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = React.useState(0);
  const { authors, refresh, membershipError } = usePageAuthors(
    channelId,
    loadAttempt,
  );
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState("");
  const [writeError, setWriteError] = React.useState("");
  const [draft, setDraft] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [external, setExternal] = React.useState<string | null>(null);
  const [tick, setTick] = React.useState(0);
  useConversationLeaveGuard(() => {
    if (draft !== null || saving) {
      toast.info(
        "Save or cancel your Page edit before leaving this conversation.",
      );
      return false;
    }
    return true;
  });
  const frame = React.useRef<HTMLIFrameElement>(null);
  const generation = React.useRef(0);
  const channelGeneration = React.useRef(0);
  const savingVersion = React.useRef<number | null>(null);
  const profile = useUserProfileQuery(head?.pubkey).data;
  // biome-ignore lint/correctness/useExhaustiveDependencies: channelId is the editor reset boundary.
  React.useEffect(() => {
    channelGeneration.current++;
    setDraft(null);
    setSaving(false);
    setExternal(null);
    setWriteError("");
    return () => {
      channelGeneration.current++;
    };
  }, [channelId]);
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
    const accept = (event: RelayEvent) => {
      if (generation.current === version && authors?.includes(event.pubkey))
        setHead((old) => pageHead(old ? [old, event] : [event], channelId));
    };
    if (!authors?.length) {
      setLoaded(authors !== null);
      return () => {
        generation.current++;
      };
    }
    const acceptLive = (event: RelayEvent) => {
      void refresh()
        .then((current) => {
          if (current.includes(event.pubkey)) accept(event);
        })
        .catch(() => {});
    };
    // Subscribe before history; merge by deterministic order so late history cannot erase a live edit.
    void relayClient
      .subscribeLive(
        pageFilter(channelId),
        acceptLive,
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
      .fetchEvents(pageFilter(channelId, authors))
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
  }, [channelId, authors, refresh]);
  React.useEffect(() => {
    let disposed = false;
    setHtml(null);
    if (head)
      void getPageHtml(head, channelId)
        .then((value) => {
          if (!disposed) {
            setHtml(value);
            setError("");
          }
        })
        .catch((error) => {
          if (!disposed) setError(String(error));
        });
    return () => {
      disposed = true;
    };
  }, [head, channelId]);
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
    const version = channelGeneration.current;
    if (draft === null || savingVersion.current === version || !canEdit) return;
    savingVersion.current = version;
    setSaving(true);
    setWriteError("");
    try {
      validatePage(draft);
      const event = await setPage(channelId, draft, head?.created_at);
      if (channelGeneration.current !== version) return;
      if (!(await refresh()).includes(event.pubkey))
        throw new Error("Page author is no longer a channel member");
      if (channelGeneration.current === version) {
        setHead((old) => pageHead(old ? [old, event] : [event], channelId));
        setDraft(null);
      }
    } catch (error) {
      if (channelGeneration.current === version) setWriteError(String(error));
    } finally {
      if (savingVersion.current === version) savingVersion.current = null;
      if (channelGeneration.current === version) setSaving(false);
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
        {canEdit && loaded && (!head || html !== null) && draft === null ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setDraft(
                html ??
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
      {writeError || error || membershipError ? (
        <p role="alert" className="text-sm text-destructive">
          {writeError || error || membershipError}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setLoadAttempt((value) => value + 1)}
          >
            Retry loading
          </Button>
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
      ) : head && html !== null ? (
        <iframe
          ref={frame}
          title="Channel Page HTML"
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          srcDoc={pageDocument(html ?? "")}
          className="min-h-96 w-full flex-1 border-0 bg-white"
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          {head
            ? "Loading Page content…"
            : loaded
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
