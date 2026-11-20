import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  isLongMessageBody,
  MESSAGE_BODY_LINE_LIMIT,
  MESSAGE_BODY_PREFERENCE_CHANGED,
  messageBodyPreferenceKey,
  readMessageBodyPreference,
  saveMessageBodyPreference,
} from "@/features/messages/lib/messageBodyCollapse";
import { cn } from "@/shared/lib/cn";

const EMBED_SELECTOR =
  "[data-link-preview-list], [data-config-nudge], img:not([data-custom-emoji]), video, audio, iframe";

/** Estimate text lines from layout fragments while ignoring embedded widgets. */
function wrappedTextExceedsLimit(
  content: HTMLElement,
  lineHeight: number,
): boolean {
  const walker = content.ownerDocument.createTreeWalker(
    content,
    NodeFilter.SHOW_TEXT,
  );
  const range = content.ownerDocument.createRange();
  const lineCenters: number[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (
      !node.textContent?.trim() ||
      node.parentElement?.closest(EMBED_SELECTOR)
    )
      continue;
    range.selectNodeContents(node);
    for (const rect of range.getClientRects?.() ?? []) {
      if (rect.width <= 0 || rect.height <= 0) continue;
      const center = (rect.top + rect.bottom) / 2;
      // Inline marks and links can split the same line into multiple rects.
      if (
        lineCenters.some(
          (previous) => Math.abs(previous - center) < lineHeight * 0.45,
        )
      )
        continue;
      lineCenters.push(center);
      if (lineCenters.length > MESSAGE_BODY_LINE_LIMIT) return true;
    }
  }
  return false;
}

export type MessageBodyAction = {
  bodyId: string;
  collapsed: boolean;
  toggle: () => void;
};

export function useMessageBodyDisclosure({
  communityId,
  viewer,
  channelId,
  messageId,
  body,
}: {
  communityId?: string;
  viewer?: string;
  channelId: string | null;
  messageId: string;
  body: string | null;
}) {
  const bodyId = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const key =
    body === null
      ? null
      : messageBodyPreferenceKey(communityId, viewer, channelId, messageId);
  const scope =
    key ??
    (communityId && channelId
      ? JSON.stringify([communityId, viewer, channelId, messageId])
      : JSON.stringify([bodyId, communityId, viewer, channelId, messageId]));
  const [measurement, setMeasurement] = useState<{
    body: string;
    exceedsLines: boolean;
    previewHeight: number;
  } | null>(null);
  const hasBody = body !== null;
  const subscribe = useCallback(
    (update: () => void) => {
      if (!hasBody) return () => {};
      const onLocalChange = (event: Event) => {
        const changed = (event as CustomEvent<string | null>).detail;
        if (changed == null || changed === scope) update();
      };
      const onStorage = (event: StorageEvent) => {
        if (event.key === key || event.key === null) update();
      };
      window.addEventListener(MESSAGE_BODY_PREFERENCE_CHANGED, onLocalChange);
      window.addEventListener("storage", onStorage);
      return () => {
        window.removeEventListener(
          MESSAGE_BODY_PREFERENCE_CHANGED,
          onLocalChange,
        );
        window.removeEventListener("storage", onStorage);
      };
    },
    [hasBody, key, scope],
  );
  const getPreference = useCallback(
    () => readMessageBodyPreference(key, scope),
    [key, scope],
  );
  const preference = useSyncExternalStore(subscribe, getPreference, () => null);
  const currentMeasurement = measurement?.body === body ? measurement : null;
  const longByText = body !== null && isLongMessageBody(body);
  const long = longByText || currentMeasurement?.exceedsLines === true;
  const collapsed = preference === "collapsed" || (preference === null && long);
  const showToggle = long || preference !== null;

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (body === null || !content) return;

    const measure = () => {
      const height = content.getBoundingClientRect().height;
      const lineHeight = Number.parseFloat(
        getComputedStyle(content).lineHeight,
      );
      if (!(height > 0 && lineHeight > 0)) return;

      // For mixed content use the text fragments instead of the height of
      // inline images, previews and their own disclosure controls.
      const exceedsLines =
        !longByText &&
        height > lineHeight * MESSAGE_BODY_LINE_LIMIT + 1 &&
        (!content.querySelector(EMBED_SELECTOR) ||
          wrappedTextExceedsLimit(content, lineHeight));
      if (!longByText && !exceedsLines) {
        setMeasurement(null);
        return;
      }
      const previewHeight = Math.max(height / 2, height - lineHeight);
      setMeasurement((previous) =>
        previous?.body === body &&
        previous.exceedsLines === exceedsLines &&
        previous.previewHeight === previewHeight
          ? previous
          : { body, exceedsLines, previewHeight },
      );
    };

    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, [body, longByText]);

  const toggle = () => {
    saveMessageBodyPreference(key, scope, collapsed ? "expanded" : "collapsed");
  };

  return {
    action: body === null ? null : { bodyId, collapsed, toggle },
    contentRef,
    showToggle,
    previewHeight: long
      ? `min(calc(var(--conversation-message-line-height) * ${MESSAGE_BODY_LINE_LIMIT}), ${currentMeasurement ? `${currentMeasurement.previewHeight}px` : "7.5em"})`
      : null,
  };
}

export function MessageBodyDisclosure({
  disclosure,
  children,
}: {
  disclosure: ReturnType<typeof useMessageBodyDisclosure>;
  children: ReactNode;
}) {
  const { action, contentRef, previewHeight, showToggle } = disclosure;
  if (!action) return children;

  const { bodyId, collapsed, toggle } = action;
  const clamp = collapsed && previewHeight !== null;

  return (
    <div className="min-w-0">
      <div
        id={bodyId}
        className={cn(
          clamp &&
            "overflow-hidden [mask-image:linear-gradient(to_bottom,black_70%,transparent)]",
        )}
        hidden={collapsed && !clamp}
        inert={collapsed}
        style={clamp ? { maxHeight: previewHeight } : undefined}
      >
        <div ref={contentRef} className="flow-root text-message">
          {children}
        </div>
      </div>
      {showToggle ? (
        <button
          aria-controls={bodyId}
          aria-expanded={!collapsed}
          className="min-h-7 rounded-sm text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
          onClick={(event) => {
            event.stopPropagation();
            toggle();
          }}
          type="button"
        >
          {collapsed ? "Show more" : "Show less"}
        </button>
      ) : null}
    </div>
  );
}
