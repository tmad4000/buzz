export function ThreadWindowRange({
  direction,
  count,
  onShow,
}: {
  direction: "earlier" | "later";
  count: number;
  onShow: () => void;
}) {
  if (count === 0) return null;
  return (
    <button
      type="button"
      className="mx-3 my-2 min-h-8 text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      onClick={onShow}
    >
      Show {direction} replies · {count} not displayed
    </button>
  );
}
