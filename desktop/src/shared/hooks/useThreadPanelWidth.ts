import * as React from "react";

import {
  AUXILIARY_PANEL_DEFAULT_WIDTH_PX,
  AUXILIARY_PANEL_MIN_WIDTH_PX,
  getAuxiliaryPanelMaxWidth,
} from "@/shared/layout/AuxiliaryPanel";

const THREAD_PANEL_WIDTH_SESSION_KEY = "buzz.desktop.thread-panel-width";

type WidthScope = { widthPx: number; setWidthPx: (width: number) => void };
const ThreadPanelWidthScopeContext = React.createContext<WidthScope | null>(
  null,
);

export function ThreadPanelWidthScopeProvider({
  children,
  initialWidthPx,
  onChange,
}: {
  children: React.ReactNode;
  initialWidthPx?: number;
  onChange?: (width: number) => void;
}) {
  const [widthPx, updateWidth] = React.useState(() =>
    Number.isFinite(initialWidthPx) &&
    (initialWidthPx ?? 0) >= AUXILIARY_PANEL_MIN_WIDTH_PX
      ? (initialWidthPx as number)
      : AUXILIARY_PANEL_DEFAULT_WIDTH_PX,
  );
  const setWidthPx = React.useCallback(
    (width: number) => {
      updateWidth(width);
      onChange?.(width);
    },
    [onChange],
  );
  const value = React.useMemo(
    () => ({ widthPx, setWidthPx }),
    [widthPx, setWidthPx],
  );
  return React.createElement(
    ThreadPanelWidthScopeContext.Provider,
    { value },
    children,
  );
}

type ThreadPanelWidthOptions = {
  defaultWidthPx?: number;
  minWidthPx?: number;
  sessionKey?: string;
};

function getViewportWidth(): number {
  return typeof window === "undefined" ? 0 : window.innerWidth;
}

/**
 * Clamp the stored panel width for the current viewport.
 *
 * The upper bound grows with the viewport (see {@link clampAuxiliaryPanelWidth}) so
 * the pane can expand on ultrawide displays. `AuxiliaryPanelShell` additionally
 * clamps the rendered width to `calc(100% - MIN)` at paint time, so a stored width
 * larger than the current viewport never collapses the main pane.
 */
function clampThreadPanelWidth(width: number, minWidthPx: number): number {
  return Math.max(
    minWidthPx,
    Math.min(getAuxiliaryPanelMaxWidth(getViewportWidth()), width),
  );
}

function getInitialThreadPanelWidth({
  defaultWidthPx,
  minWidthPx,
  sessionKey,
}: Required<ThreadPanelWidthOptions>): number {
  if (typeof window === "undefined") {
    return defaultWidthPx;
  }

  try {
    const raw = window.sessionStorage.getItem(sessionKey);
    if (!raw) {
      return defaultWidthPx;
    }

    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) {
      return defaultWidthPx;
    }

    return clampThreadPanelWidth(parsed, minWidthPx);
  } catch {
    return defaultWidthPx;
  }
}

export function useThreadPanelWidth(
  availableWidthPx?: number,
  options: ThreadPanelWidthOptions = {},
) {
  const scope = React.useContext(ThreadPanelWidthScopeContext);
  const defaultWidthPx =
    options.defaultWidthPx ?? AUXILIARY_PANEL_DEFAULT_WIDTH_PX;
  const minWidthPx = options.minWidthPx ?? AUXILIARY_PANEL_MIN_WIDTH_PX;
  const sessionKey = options.sessionKey ?? THREAD_PANEL_WIDTH_SESSION_KEY;
  const getAvailableWidth = React.useCallback(
    () => availableWidthPx ?? getViewportWidth(),
    [availableWidthPx],
  );
  const [legacyWidthPx, setLegacyWidthPx] = React.useState<number>(() =>
    scope
      ? defaultWidthPx
      : getInitialThreadPanelWidth({ defaultWidthPx, minWidthPx, sessionKey }),
  );
  const widthPx = scope?.widthPx ?? legacyWidthPx;
  const setWidthPx = scope?.setWidthPx ?? setLegacyWidthPx;
  const [isResizing, setIsResizing] = React.useState(false);
  const endResize = React.useRef<(() => void) | null>(null);
  React.useEffect(() => () => endResize.current?.(), []);

  React.useEffect(() => {
    if (scope || typeof window === "undefined") {
      return;
    }

    try {
      window.sessionStorage.setItem(sessionKey, String(widthPx));
    } catch {
      // Ignore storage failures and keep in-memory width for this session.
    }
  }, [scope, sessionKey, widthPx]);

  const onResizeStart = React.useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      endResize.current?.();

      const startX = event.clientX;
      const startWidth = widthPx;
      const previousCursor = document.body.style.cursor;
      const previousUserSelect = document.body.style.userSelect;

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      setIsResizing(true);

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const deltaX = startX - moveEvent.clientX;
        const nextWidth = Math.max(
          minWidthPx,
          Math.min(
            getAuxiliaryPanelMaxWidth(getAvailableWidth()),
            startWidth + deltaX,
          ),
        );
        setWidthPx(nextWidth);
      };

      const handlePointerEnd = () => {
        endResize.current = null;
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;
        setIsResizing(false);
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerEnd);
        window.removeEventListener("pointercancel", handlePointerEnd);
      };
      endResize.current = handlePointerEnd;

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerEnd);
      window.addEventListener("pointercancel", handlePointerEnd);
    },
    [getAvailableWidth, minWidthPx, setWidthPx, widthPx],
  );

  const onResetWidth = React.useCallback(() => {
    setWidthPx(defaultWidthPx);
  }, [defaultWidthPx, setWidthPx]);

  return {
    canReset: widthPx !== defaultWidthPx,
    isResizing,
    onResetWidth,
    onResizeStart,
    widthPx,
  };
}
