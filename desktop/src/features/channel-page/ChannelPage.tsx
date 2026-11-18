import type { PageLeaveGuardRegistrar } from "./pageLeaveGuard";
import { usePageAuthors } from "./usePageAuthors";
import * as React from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { relayClient } from "@/shared/api/relayClient";
import type { RelayEvent } from "@/shared/api/types";
import { useUserProfileQuery } from "@/features/profile/hooks";
import { useElementWidth } from "@/shared/hooks/use-mobile";
import { PageContentsPopover, PageContentsRail } from "./PageContents";
import { Button } from "@/shared/ui/button";
import { pageHead, validatePage } from "./model";
import { pageFilter, setPage, getPageHtml } from "./service";
import { pageDocument, pageExternalLink } from "./sandbox";

/** Pane-ready content: scope and lifetime belong to the containing view instance. */
export function ChannelPage({
  channelId,
  canEdit,
  onClose,
  registerLeaveGuard,
  expanded = false,
  onShortcut,
}: {
  channelId: string;
  canEdit: boolean;
  onClose?: () => void;
  registerLeaveGuard?: PageLeaveGuardRegistrar;
  expanded?: boolean;
  onShortcut?: (action: "toggle" | "restore") => void;
}) {
  const editorId = React.useId();
  const [sectionRef, sectionWidth] = useElementWidth<HTMLElement>();
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
  const [leaveBlocked, setLeaveBlocked] = React.useState(false);
  const draftRef = React.useRef<string | null>(null);
  const baselineRef = React.useRef<string | null>(null);
  const mounted = React.useRef(false);
  const updateDraft = React.useCallback((value: string | null) => {
    draftRef.current = value;
    setDraft(value);
    setLeaveBlocked(false);
  }, []);
  const [external, setExternal] = React.useState<string | null>(null);
  const [tick, setTick] = React.useState(0);
  const frame = React.useRef<HTMLIFrameElement>(null);
  const generation = React.useRef(0);
  const channelGeneration = React.useRef(0);
  const savingVersion = React.useRef<number | null>(null);
  const profile = useUserProfileQuery(head?.pubkey).data;
  const requirePageEditResolution = React.useCallback(() => {
    if (!mounted.current) return false;
    const dirty =
      draftRef.current !== null && draftRef.current !== baselineRef.current;
    if (!dirty && savingVersion.current !== channelGeneration.current)
      return true;
    setLeaveBlocked(true);
    return false;
  }, []);
  React.useLayoutEffect(() => {
    mounted.current = true;
    const unregister = registerLeaveGuard?.(requirePageEditResolution);
    return () => {
      mounted.current = false;
      unregister?.();
    };
  }, [registerLeaveGuard, requirePageEditResolution]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: channelId is the editor reset boundary.
  React.useEffect(() => {
    channelGeneration.current++;
    updateDraft(null);
    setSaving(false);
    setExternal(null);
    setWriteError("");
    return () => {
      channelGeneration.current++;
    };
  }, [channelId, updateDraft]);
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
      if (!frame.current || event.source !== frame.current.contentWindow)
        return;
      if (event.data?.type === "buzz-page-link") {
        setExternal(pageExternalLink(event.data.href));
      } else if (event.data?.type === "buzz-page-shortcut") {
        const action = event.data.action;
        if (action === "toggle" || action === "restore") onShortcut?.(action);
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [onShortcut]);
  const save = async () => {
    const version = channelGeneration.current;
    if (
      draftRef.current === null ||
      savingVersion.current === version ||
      !canEdit
    )
      return;
    savingVersion.current = version;
    setSaving(true);
    setWriteError("");
    try {
      const content = draftRef.current;
      if (content === null) return;
      validatePage(content);
      const event = await setPage(channelId, content, head?.created_at);
      if (channelGeneration.current !== version) return;
      if (!(await refresh()).includes(event.pubkey))
        throw new Error("Page author is no longer a channel member");
      if (channelGeneration.current === version) {
        setHead((old) => pageHead(old ? [old, event] : [event], channelId));
        updateDraft(null);
      }
    } catch (error) {
      if (channelGeneration.current === version) setWriteError(String(error));
    } finally {
      if (savingVersion.current === version) savingVersion.current = null;
      if (channelGeneration.current === version) setSaving(false);
    }
  };
  const page = React.useMemo(
    () => (html === null ? null : pageDocument(html)),
    [html],
  );
  const showContents = Boolean(
    head && page && page.headings.length >= 3 && draft === null,
  );
  const useContentsRail = showContents && expanded && sectionWidth >= 640;
  const scrollToHeading = (id: string) => {
    frame.current?.contentWindow?.postMessage(
      { type: "buzz-page-scroll", id },
      "*",
    );
  };
  const age = head
    ? Math.max(0, Math.floor((Date.now() / 1000 - head.created_at) / 60))
    : 0;
  void tick;
  return (
    <section
      ref={sectionRef}
      className="flex h-full min-h-0 flex-col gap-3"
      aria-label="Channel Page"
      onKeyDown={(event) => {
        if (
          onShortcut &&
          event.metaKey &&
          event.shiftKey &&
          !event.repeat &&
          !event.defaultPrevented &&
          event.key.toLowerCase() === "f"
        ) {
          event.preventDefault();
          event.stopPropagation();
          onShortcut("toggle");
        }
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 flex-1 break-all text-xs text-muted-foreground">
          {head
            ? `Updated ${age < 1 ? "just now" : age < 60 ? `${age}m ago` : age < 1440 ? `${Math.floor(age / 60)}h ago` : `${Math.floor(age / 1440)}d ago`} by ${profile?.displayName || head.pubkey}`
            : "One shared HTML Page for this conversation"}
        </span>
        {canEdit && loaded && (!head || html !== null) && draft === null ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const initial =
                html ??
                "<!doctype html><html><body><h1>Page</h1></body></html>";
              baselineRef.current = initial;
              updateDraft(initial);
            }}
          >
            {head ? "Edit HTML" : "Create Page"}
          </Button>
        ) : null}
        {showContents && !useContentsRail && page ? (
          <PageContentsPopover
            headings={page.headings}
            onSelect={scrollToHeading}
          />
        ) : null}
        {onShortcut ? (
          <Button
            size="sm"
            variant="outline"
            aria-keyshortcuts="Meta+Shift+F"
            onClick={() => onShortcut("toggle")}
          >
            {expanded ? "Restore" : "Expand"}
          </Button>
        ) : null}
        {onClose ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (requirePageEditResolution()) onClose();
            }}
          >
            Close
          </Button>
        ) : null}
      </div>
      {leaveBlocked ? (
        <p role="status" className="text-sm text-muted-foreground">
          {saving
            ? "Page is saving. Wait for it to finish before closing or replacing this pane."
            : "Save or cancel your Page edits before closing or replacing this pane."}
        </p>
      ) : null}
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
            onChange={(e) => updateDraft(e.target.value)}
            disabled={saving}
          />
          <div className="flex gap-2">
            <Button disabled={saving} onClick={() => void save()}>
              {saving ? "Saving…" : "Save Page"}
            </Button>
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => updateDraft(null)}
            >
              Cancel
            </Button>
          </div>
        </>
      ) : head && page ? (
        <div className="flex min-h-0 flex-1 gap-3">
          {useContentsRail ? (
            <PageContentsRail
              key={channelId}
              channelId={channelId}
              headings={page.headings}
              onSelect={scrollToHeading}
            />
          ) : null}
          <iframe
            key="page-frame"
            ref={frame}
            title="Channel Page HTML"
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            srcDoc={page.srcDoc}
            className="min-h-0 min-w-0 w-full flex-1 border-0 bg-white"
          />
        </div>
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
