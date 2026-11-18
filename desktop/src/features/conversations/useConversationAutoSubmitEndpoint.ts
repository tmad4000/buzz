import * as React from "react";
import { ConversationAutoSubmitContext } from "./ConversationAutoSubmitScope";
import { DraftEditorPresentationContext } from "./ConversationDraftEditors";
import { ConversationViewContext } from "./ConversationViewContext";

/** Register the live owner only. Registration never issues a send command. */
export function useConversationAutoSubmitEndpoint<T>({
  channelId,
  draftKey,
  editorKey,
  getElement,
  read,
  equals,
  submit,
}: {
  channelId: string | null | undefined;
  draftKey: string | null | undefined;
  editorKey: object | null;
  getElement: () => HTMLElement | null;
  read: () => T | null;
  equals: (captured: T, current: T) => boolean;
  submit: (captured: T) => Promise<void>;
}) {
  const scope = React.useContext(ConversationAutoSubmitContext);
  const view = React.useContext(ConversationViewContext);
  const presentation = React.useContext(DraftEditorPresentationContext);
  const current = React.useRef({
    scope,
    view,
    presentation,
    read,
    equals,
    submit,
    channelId,
    draftKey,
    editorKey,
    getElement,
  });
  current.current = {
    scope,
    view,
    presentation,
    read,
    equals,
    submit,
    channelId,
    draftKey,
    editorKey,
    getElement,
  };
  const viewId = view?.viewInstanceId;
  React.useEffect(() => {
    if (!scope || !viewId || !channelId || !draftKey || !editorKey) return;
    let resolvedElement: HTMLElement | null;
    try {
      resolvedElement = current.current.getElement();
    } catch {
      return;
    }
    if (!resolvedElement) return;
    const element = resolvedElement;
    const ownerId = scope.coordinator.owner(draftKey);
    const visit = scope.visitForView(viewId);
    if (!ownerId || visit === undefined) return;
    let mounted = true;
    const admitted = () => {
      const live = current.current;
      const doc = element.ownerDocument;
      return (
        mounted &&
        live.scope === scope &&
        live.channelId === channelId &&
        live.draftKey === draftKey &&
        live.editorKey === editorKey &&
        live.getElement() === element &&
        live.view?.viewInstanceId === viewId &&
        live.view.focused &&
        live.view.visible &&
        live.view.interactive !== false &&
        live.presentation?.canEdit() === true &&
        scope.coordinator.owner(draftKey) === ownerId &&
        scope.visitForView(viewId) === visit &&
        doc.visibilityState === "visible" &&
        doc.hasFocus() &&
        element.isConnected &&
        live.view.rootRef?.current?.contains(element) === true &&
        !element.closest('[hidden], [inert], [aria-hidden="true"]') &&
        element.getClientRects().length > 0 &&
        doc.defaultView?.getComputedStyle(element).visibility !== "hidden"
      );
    };
    const unregister = scope.commands.register({
      target: {
        scopeKey: scope.scopeKey,
        viewId,
        channelId,
        draftKey,
        ownerId,
        visit,
      },
      admit: admitted,
      submit: async () => {
        throw new Error("Composer command requires captured state");
      },
      capture: () => {
        if (!admitted()) return null;
        const options = current.current;
        const captured = options.read();
        if (captured === null) return null;
        const canSubmit = () => {
          if (!admitted()) return false;
          const next = current.current.read();
          return next !== null && options.equals(captured, next);
        };
        return {
          admit: canSubmit,
          submit: async () => {
            if (canSubmit()) await options.submit(captured);
          },
        };
      },
    });
    // Native input/coverage events fence intervals even without a React render.
    const retire = () => scope.commands.retireAll();
    element.addEventListener("beforeinput", retire);
    element.addEventListener("input", retire);
    const observer = new MutationObserver(retire);
    for (
      let node: HTMLElement | null = element;
      node;
      node = node.parentElement
    )
      observer.observe(node, {
        attributes: true,
        attributeFilter: ["hidden", "inert", "aria-hidden", "class", "style"],
      });
    return () => {
      mounted = false;
      unregister();
      observer.disconnect();
      element.removeEventListener("beforeinput", retire);
      element.removeEventListener("input", retire);
    };
  }, [scope, viewId, channelId, draftKey, editorKey]);
  // Committed attachment/edit/voice/context changes invalidate captured admission.
  React.useLayoutEffect(() => {
    scope?.commands.retireInvalid();
  });
}
