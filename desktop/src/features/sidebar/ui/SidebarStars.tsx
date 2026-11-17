import { createContext, useContext, type ReactNode } from "react";
import { Star } from "lucide-react";
import { cn } from "@/shared/lib/cn";

export type SidebarStarActions = {
  ids: ReadonlySet<string>;
  star: (id: string | readonly string[]) => undefined | Promise<boolean>;
  unstar: (id: string) => void;
};
const StarContext = createContext<SidebarStarActions | null>(null);
export const useSidebarStars = () => useContext(StarContext);
export function SidebarStarProvider({
  value,
  children,
}: {
  value: SidebarStarActions | null;
  children: ReactNode;
}) {
  return <StarContext.Provider value={value}>{children}</StarContext.Provider>;
}

/** A sibling of the navigation button, never a nested button or drag handle. */
export function SidebarStarToggle({
  id,
  label,
}: {
  id: string;
  label: string;
}) {
  const actions = useSidebarStars();
  if (!actions) return null;
  const selected = actions.ids.has(id);
  return (
    <button
      type="button"
      aria-label={`${selected ? "Unstar" : "Star"} ${label}`}
      aria-pressed={selected}
      className="absolute right-6 top-1/2 z-10 -translate-y-1/2 rounded p-1 text-sidebar-foreground/60 opacity-0 hover:text-sidebar-foreground focus-visible:opacity-100 group-hover/menu-item:opacity-100 group-focus-within/menu-item:opacity-100"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        if (selected) actions.unstar(id);
        else actions.star(id);
      }}
    >
      <Star className={cn("size-3.5", selected && "fill-current")} />
    </button>
  );
}
