import * as React from "react";
import { useThreadDisclosureFocus } from "@/features/messages/ui/useThreadDisclosureFocus";
import { PanelRight, ChevronDown, ChevronRight } from "lucide-react";
import { loadActiveCommunityId } from "@/features/communities/communityStorage";
import type { UserProfileLookup } from "@/features/profile/lib/identity";
import type { TimelineThreadSummary } from "@/features/messages/lib/threadPanel";
import {
  loadThreadExpansion,
  saveThreadExpansion,
  threadExpansionKey,
  THREAD_EXPANSION_CHANGED,
  type ThreadExpansionChange,
} from "@/features/messages/lib/threadExpansionStorage";
import {
  completeThreadAncestors,
  sidebarVisualMessage,
} from "@/features/messages/lib/unreadSidebar";
import { THREAD_REPLY_ROW_MARGIN_INLINE_REM } from "@/features/messages/lib/threadTreeLayout";
import type { TimelineMessage } from "@/features/messages/types";
import { MessageComposer } from "@/features/messages/ui/MessageComposer";
import type { MessageComposerProps } from "@/features/messages/ui/MessageComposer.types";
import { MessageThreadRow } from "@/features/messages/ui/MessageThreadRow";
import { MessageThreadSummaryRow } from "@/features/messages/ui/MessageThreadSummaryRow";
import { ThreadRepliesErrorCard } from "@/features/messages/ui/MessageThreadReplyState";
import { useInlineAutoExpansion } from "@/features/messages/ui/InlineAutoExpansion";
import { useInlineThreadData } from "@/features/messages/ui/useInlineThreadData";
import { useVisibleThreadReplies } from "@/features/messages/ui/useVisibleThreadReplies";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import type { Channel, RespondToMode } from "@/shared/api/types";
export type InlineChannelThreadProps = {
  channel: Channel;
  currentPubkey?: string;
  root: TimelineMessage;
  summary: TimelineThreadSummary;
  unreadCount?: number;
  isUnread?: (id: string) => boolean;
  profiles?: UserProfileLookup;
  ownerProfiles?: UserProfileLookup;
  personaLookup?: Map<string, string>;
  respondToLookup?: Map<string, RespondToMode>;
  disabled: boolean;
  isSending: boolean;
  onOpenThread: (message: TimelineMessage) => void;
  onJumpToThreadMessage?: (rootId: string, messageId: string) => void;
  onSend: MessageComposerProps["onSend"];
  onToggleReaction?: (
    message: TimelineMessage,
    emoji: string,
    remove: boolean,
  ) => Promise<void>;
  onRepliesRevealed?: (messages: TimelineMessage[], rootId?: string) => void;
};
type Props = InlineChannelThreadProps;
export function InlineChannelThread(props: Props) {
  const community = React.useMemo(loadActiveCommunityId, []);
  const key = `${threadExpansionKey(community, props.currentPubkey, props.channel.id, props.root.id)}:inline`;
  return <ScopedInlineThread key={key} {...props} storageKey={key} />;
}
function ScopedInlineThread(props: Props & { storageKey: string }) {
  const { root, summary, storageKey, onOpenThread, unreadCount } = props;
  const auto = useInlineAutoExpansion();
  const [choice, setChoice] = React.useState(() =>
    loadThreadExpansion(storageKey).get(root.id),
  );
  const [storageFailed, setStorageFailed] = React.useState(false);
  const [snapshot, setSnapshot] = React.useState<{
    ready: boolean;
    kind: "compact" | null;
  }>({ ready: false, kind: null });
  const actorReady = Boolean(props.currentPubkey);
  const automatic =
    actorReady &&
    (auto.opened.has(root.id) ||
      (auto.policy.channels === "expanded" && summary.replyCount > 0));
  const candidate =
    actorReady &&
    choice === undefined &&
    auto.policy.channels === "smart" &&
    summary.replyCount >= 1 &&
    summary.replyCount <= 4;
  const enabled =
    choice === true || (choice === undefined && (automatic || candidate));
  const data = useInlineThreadData(
    props,
    enabled,
    auto.scope,
    auto.policy,
    auto.answerTargets.get(root.id),
  );
  const legacyClosed = data.thread.remembered.get(root.id) === false;
  const expanded = choice ?? (automatic && !legacyClosed);
  const regionId = React.useId();
  const controlsRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLElement>(null);
  useThreadDisclosureFocus({
    scope: `${auto.scope}:${root.id}`,
    root: root.id,
    regions: [controlsRef, contentRef],
    messages: data.thread.index.messageById,
    expanded: expanded ? data.thread.expanded : new Set<string>(),
  });
  React.useEffect(() => {
    const changed = (event: Event) => {
      const change = (event as CustomEvent<ThreadExpansionChange>).detail;
      if (change?.key !== storageKey) return;
      setChoice(change.branches.get(root.id));
      setStorageFailed(!change.persisted);
    };
    window.addEventListener(THREAD_EXPANSION_CHANGED, changed);
    return () => window.removeEventListener(THREAD_EXPANSION_CHANGED, changed);
  }, [storageKey, root.id]);
  React.useEffect(() => () => auto.remove(root.id), [auto.remove, root.id]);
  React.useEffect(() => {
    let kind: "answer" | "compact" | "expanded" | null = null;
    let ready = true;
    if (actorReady && choice === undefined && !legacyClosed) {
      if (auto.policy.channels === "expanded" && summary.replyCount > 0)
        kind = "expanded";
      else if (auto.policy.channels === "smart") {
        const parents = data.decision?.answerId
          ? completeThreadAncestors(
              data.thread.index.messageById,
              root.id,
              data.decision.answerId,
            )
          : null;
        if (
          data.decision?.kind === "answer" &&
          parents &&
          [...parents].every((id) => data.thread.remembered.get(id) !== false)
        )
          kind = "answer";
        else if (snapshot.ready) kind = snapshot.kind;
        else if (summary.replyCount === 0 || data.ready) {
          kind = data.decision?.kind === "compact" ? "compact" : null;
          setSnapshot({ ready: true, kind });
        } else ready = false;
      }
    }
    auto.register({
      id: root.id,
      kind,
      ready,
      lastAt: summary.lastReplyAt ?? root.createdAt,
      answerId: kind === "answer" ? data.decision?.answerId : undefined,
    });
  }, [
    auto.register,
    auto.policy.channels,
    actorReady,
    choice,
    legacyClosed,
    root.id,
    root.createdAt,
    summary.replyCount,
    summary.lastReplyAt,
    data.decision,
    data.ready,
    data.thread.index,
    data.thread.remembered,
    snapshot,
  ]);
  const [focusReply, setFocusReply] = React.useState(false);
  const toggle = () => {
    const next = !expanded;
    const persisted = saveThreadExpansion(
      storageKey,
      new Map([[root.id, next]]),
    );
    setChoice(next);
    setStorageFailed(!persisted);
    setFocusReply(next && summary.replyCount === 0);
    if (next) data.thread.setExpanded(root.id, true);
  };
  React.useEffect(() => {
    if (!expanded || !focusReply) return;
    const editor = contentRef.current?.querySelector<HTMLElement>(
      '[data-testid="message-input"]',
    );
    if (editor?.isContentEditable) {
      editor.focus();
      setFocusReply(false);
    }
  }, [expanded, focusReply]);
  return (
    <>
      <div ref={controlsRef} className="flex items-center gap-1">
        <MessageThreadSummaryRow
          message={root}
          summary={summary}
          unreadCount={unreadCount}
          showDepthGuides={false}
          summaryIndentOffsetRem={-THREAD_REPLY_ROW_MARGIN_INLINE_REM}
          expanded={expanded}
          controlsId={regionId}
          onOpenThread={toggle}
        />
        {summary.replyCount > 0 ? (
          <button
            type="button"
            className="mb-1 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Open thread in side panel"
            title="Open thread in side panel"
            data-testid="open-thread-side-panel"
            data-thread-head-id={root.id}
            onClick={() => onOpenThread(root)}
          >
            <PanelRight className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </div>
      {storageFailed || data.thread.preferenceError ? (
        <p role="status" className="ml-10 text-xs text-muted-foreground">
          View preference could not be saved; this choice is session-only.
        </p>
      ) : null}
      {expanded ? (
        <section
          ref={contentRef}
          id={regionId}
          aria-label={`Inline replies to ${root.author}`}
          data-testid="inline-thread"
          data-thread-head-id={root.id}
          className="mb-3 ml-10 min-w-0 border-l border-border/60 pl-2"
        >
          <InlineThreadContent
            {...props}
            data={data}
            focusReply={focusReply}
            scope={auto.scope}
            previewTarget={
              choice === undefined ? auto.answerTargets.get(root.id) : undefined
            }
          />
        </section>
      ) : null}
    </>
  );
}
function InlineThreadContent({
  channel,
  root,
  summary,
  currentPubkey,
  disabled,
  isSending,
  onSend,
  onJumpToThreadMessage,
  onToggleReaction,
  onRepliesRevealed,
  storageKey,
  data,
  scope,
  previewTarget,
  focusReply,
}: Props & {
  storageKey: string;
  data: ReturnType<typeof useInlineThreadData>;
  scope: string;
  previewTarget?: string;
  focusReply: boolean;
}) {
  const { query, thread, combinedProfiles, canonicalRoot } = data;
  const [replyTarget, setReplyTarget] = React.useState<TimelineMessage | null>(
    null,
  );
  const mobile = useIsMobile();
  const [extra, setExtra] = React.useState(0);
  const [showAll, setShowAll] = React.useState(false);
  const limit = (mobile ? 4 : 8) + extra;
  const rootOpen = thread.expanded.has(root.id);
  const previewIds = React.useMemo(() => {
    if (!previewTarget || showAll) return null;
    const parents = completeThreadAncestors(
      thread.index.messageById,
      root.id,
      previewTarget,
    );
    return parents ? new Set([...parents, previewTarget]) : null;
  }, [previewTarget, showAll, thread.index, root.id]);
  const entries = React.useMemo(
    () =>
      rootOpen
        ? thread.entries
            .filter((entry) => !previewIds || previewIds.has(entry.message.id))
            .slice(0, limit)
        : [],
    [rootOpen, thread.entries, previewIds, limit],
  );
  const rows = React.useMemo(
    () => entries.map((entry) => entry.message),
    [entries],
  );
  const region = React.useRef<HTMLDivElement>(null);
  useVisibleThreadReplies(
    region,
    rows,
    onRepliesRevealed,
    canonicalRoot,
    `${scope}:${root.id}`,
  );
  const more = thread.entries.length > entries.length || query.hasNextPage;
  return (
    <>
      {query.isPending ? (
        <p role="status" className="px-3 py-3 text-sm text-muted-foreground">
          Loading replies…
        </p>
      ) : null}
      {query.isError ? (
        <ThreadRepliesErrorCard
          onRetry={() => {
            void query.refetch();
          }}
        />
      ) : null}
      {!query.isPending && !rootOpen ? (
        <button
          type="button"
          className="mx-3 my-2 text-sm text-primary"
          aria-expanded="false"
          data-thread-head-id={root.id}
          onClick={() => thread.setExpanded(root.id, true)}
        >
          Show replies
        </button>
      ) : null}
      <div
        ref={region}
        data-testid="inline-thread-replies"
        className="max-sm:[&_[data-testid=message-body]]:pt-4"
      >
        {entries.map(({ message }) => {
          const stats = thread.index.descendantStatsByMessageId.get(message.id);
          const hasChildren = (stats?.descendantCount ?? 0) > 0;
          const open = thread.expanded.has(message.id);
          return (
            <div key={message.renderKey ?? message.id}>
              <span className="sr-only">Reply depth {message.depth}</span>
              <MessageThreadRow
                parentMessages={thread.index.messageById}
                onJumpToThreadMessage={onJumpToThreadMessage}
                channelId={channel.id}
                actionBarPlacement="inside"
                currentPubkey={currentPubkey}
                message={sidebarVisualMessage(message)}
                profiles={combinedProfiles}
                showDepthGuides={false}
                onReply={setReplyTarget}
                onToggleReaction={onToggleReaction}
              />
              {hasChildren ? (
                <button
                  type="button"
                  aria-expanded={open}
                  data-testid="inline-branch-toggle"
                  data-thread-head-id={message.id}
                  className="ml-12 flex min-h-7 items-center gap-1 text-xs text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => thread.toggle(message)}
                >
                  {open ? (
                    <ChevronDown className="size-3" aria-hidden />
                  ) : (
                    <ChevronRight className="size-3" aria-hidden />
                  )}
                  {open
                    ? "Hide replies"
                    : data.complete
                      ? `${stats?.descendantCount} replies`
                      : "More replies"}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      {!query.isPending && rootOpen && more ? (
        <button
          type="button"
          className="mx-3 my-2 text-sm font-medium text-primary hover:underline"
          disabled={query.isFetchingNextPage}
          onClick={() => {
            setShowAll(true);
            setExtra((value) => value + 20);
            if (
              thread.entries.length < limit + 20 &&
              query.hasNextPage &&
              !query.isFetchingNextPage
            )
              void query.fetchNextPage();
          }}
        >
          {query.isFetchingNextPage
            ? "Loading more replies…"
            : query.hasNextPage
              ? "More replies"
              : `Show ${Math.min(20, thread.entries.length - entries.length)} more replies`}
        </button>
      ) : null}
      {data.missingRange && !query.isError ? (
        <p className="px-3 py-2 text-sm text-muted-foreground">
          {query.isFetching ? (
            "Loading replies…"
          ) : (
            <>
              Some replies are unavailable.{" "}
              <button
                type="button"
                className="underline"
                onClick={() => {
                  void query.refetch();
                }}
              >
                Retry missing replies
              </button>
            </>
          )}
        </p>
      ) : null}
      {!query.isPending &&
      !query.isError &&
      !data.missingRange &&
      rootOpen &&
      thread.entries.length === 0 &&
      summary.replyCount > 0 ? (
        <p className="px-3 py-2 text-sm text-muted-foreground">
          {summary.replyCount > 0
            ? "Some replies are unavailable."
            : "No replies yet."}
        </p>
      ) : null}
      <MessageComposer
        autoFocus={focusReply}
        compactWhenEmpty
        accessibleLabel={`Reply in thread to ${root.author}`}
        channelId={channel.id}
        channelName={channel.name}
        channelType={channel.channelType}
        audienceContext={{ type: "thread", rootTags: root.tags }}
        draftKey={`inline:${storageKey}`}
        disabled={disabled}
        isSending={isSending}
        profiles={combinedProfiles}
        replyTarget={replyTarget}
        onCancelReply={() => setReplyTarget(null)}
        onCaptureSendContext={() => ({
          parentEventId: replyTarget?.id ?? root.id,
          threadHeadId: canonicalRoot,
          localSendOrigin: thread.captureOwnSendOrigin(),
        })}
        onSend={async (...args) => {
          await onSend(...args);
          setReplyTarget((current) =>
            current?.id === args[4]?.parentEventId ? null : current,
          );
        }}
        placeholder="Reply…"
        containerClassName="px-2 pb-2"
        showBackgroundUploadProgress={false}
        typingParentEventId={root.id}
        typingRootEventId={canonicalRoot}
      />
    </>
  );
}
