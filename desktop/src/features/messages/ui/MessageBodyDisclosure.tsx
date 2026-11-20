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
  type MessageBodyPreference,
  messageBodyPreferenceKey,
  readMessageBodyPreference,
  saveMessageBodyPreference,
} from "@/features/messages/lib/messageBodyCollapse";
import { cn } from "@/shared/lib/cn";

const PREFERENCE_CHANGED = "buzz:message-body-preference-changed";
const EMBED_SELECTOR =
  "[data-link-preview-list], [data-config-nudge], img:not([data-custom-emoji]), video, audio, iframe";

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
    key ?? JSON.stringify([communityId, viewer, channelId, messageId]);
  const [temporary, setTemporary] = useState<{
    scope: string;
    value: MessageBodyPreference;
  } | null>(null);
  const [measurement, setMeasurement] = useState<{
    body: string;
    exceedsLines: boolean;
    previewHeight: number;
  } | null>(null);
  const subscribe = useCallback(
    (update: () => void) => {
      if (!key) return () => {};
      const onLocalChange = (event: Event) => {
        if ((event as CustomEvent<string>).detail === key) update();
      };
      const onStorage = (event: StorageEvent) => {
        if (event.key === key || event.key === null) update();
      };
      window.addEventListener(PREFERENCE_CHANGED, onLocalChange);
      window.addEventListener("storage", onStorage);
      return () => {
        window.removeEventListener(PREFERENCE_CHANGED, onLocalChange);
        window.removeEventListener("storage", onStorage);
      };
    },
    [key],
  );
  const getPreference = useCallback(
    () => readMessageBodyPreference(key),
    [key],
  );
  const stored = useSyncExternalStore(subscribe, getPreference, () => null);
  const preference = temporary?.scope === scope ? temporary.value : stored;
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

      // Media and rich previews have their own controls. Their height alone
      // does not turn a short message into a long text disclosure.
      const exceedsLines =
        height > lineHeight * MESSAGE_BODY_LINE_LIMIT + 1 &&
        !content.querySelector(EMBED_SELECTOR);
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
    const value = collapsed ? "expanded" : "collapsed";
    if (saveMessageBodyPreference(key, value)) {
      // The storage event only reaches other windows. Update copies of the
      // same message in this window as well (e.g. timeline and thread).
      setTemporary(null);
      window.dispatchEvent(
        new CustomEvent(PREFERENCE_CHANGED, { detail: key }),
      );
    } else {
      setTemporary({ scope, value });
    }
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
