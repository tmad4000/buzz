import type { Editor } from "@tiptap/core";
import { useEffect } from "react";

/** One explicit Reply activation, shared with the destination until consumed. */
export type ReplyFocusRequest = { pending: boolean };

export function useReplyComposerFocus(
  {
    editor,
    focusPreserve,
  }: { editor: Editor | null; focusPreserve: () => void },
  replyTarget: { id: string } | null,
  request: ReplyFocusRequest | undefined,
  enabled: boolean,
  canFocusConversation: boolean,
) {
  useEffect(() => {
    if (enabled && replyTarget && !request) focusPreserve();
  }, [enabled, replyTarget, request, focusPreserve]);

  useEffect(() => {
    if (!enabled || !canFocusConversation || !request?.pending || !editor)
      return;
    const frame = requestAnimationFrame(() => {
      if (!request.pending || editor.isDestroyed || !editor.isEditable) return;
      const input = editor.view.dom;
      if (!input.isConnected || input.closest("[inert]")) return;

      request.pending = false;
      // ProseMirror focuses without scrolling the browser or moving the caret.
      editor.view.focus();
      const rect = input.getBoundingClientRect();
      const container = input
        .closest("[data-buzz-conversation-scroll]")
        ?.getBoundingClientRect();
      const top = Math.max(0, container?.top ?? 0);
      const bottom = Math.min(
        window.innerHeight,
        container?.bottom ?? Infinity,
      );
      if (rect.top < top || rect.bottom > bottom) {
        input.scrollIntoView({
          block: "nearest",
          inline: "nearest",
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "instant"
            : "smooth",
        });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [editor, enabled, canFocusConversation, request]);
}
