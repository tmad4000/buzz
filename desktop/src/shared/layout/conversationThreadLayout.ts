/** Scoped conversation leaves follow the split design; legacy route sizing stays separate. */
export const CONVERSATION_THREAD_DOCK_WIDTH_PX = 760;
export const CONVERSATION_CHAT_MIN_WIDTH_PX = 400;
export const CONVERSATION_THREAD_MIN_WIDTH_PX = 320;
export const CONVERSATION_THREAD_GUTTER_PX = 8;
export const CONVERSATION_CHAT_RESERVE_PX =
  CONVERSATION_CHAT_MIN_WIDTH_PX + CONVERSATION_THREAD_GUTTER_PX;

export function getScopedThreadMaxWidth(available: number): number {
  return Number.isFinite(available)
    ? Math.max(
        CONVERSATION_THREAD_MIN_WIDTH_PX,
        available - CONVERSATION_CHAT_RESERVE_PX,
      )
    : CONVERSATION_THREAD_MIN_WIDTH_PX;
}
export function clampScopedThreadWidth(
  preferred: number,
  available: number,
): number {
  return Math.max(
    CONVERSATION_THREAD_MIN_WIDTH_PX,
    Math.min(
      Number.isFinite(preferred) ? preferred : 380,
      getScopedThreadMaxWidth(available),
    ),
  );
}
