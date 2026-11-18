/** A search activation is explicit navigation even without a routed message target. */
export function mainReadingIntent(
  targetMessageId: string | null | undefined,
  searchActiveMessageId: string | null | undefined,
) {
  const target = targetMessageId || null;
  const search = searchActiveMessageId || null;
  return {
    explicit: target !== null || search !== null,
    key: JSON.stringify([target, search]),
  };
}
