import {
  createContext,
  useContext,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { SortableSectionShell } from "./SidebarDnd";

type Controls = {
  dragHandleProps?: HTMLAttributes<HTMLElement>;
  moveUp: () => void;
  moveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
};
const OrderContext = createContext<Controls | null>(null);
export const useSidebarSectionOrder = () => useContext(OrderContext);

/** Built-in and custom headers share the existing section drag context/identity. */
export function SidebarLayout({
  order,
  builtins,
  renderCustom,
  onReorder,
}: {
  order: string[];
  builtins: Record<string, ReactNode>;
  renderCustom: (id: string, controls: Controls) => ReactNode;
  onReorder: (ids: string[]) => void;
}) {
  const visible = order.filter(
    (id) => !id.startsWith("builtin:") || builtins[id],
  );
  return (
    <>
      {visible.map((id, index) => {
        const move = (direction: -1 | 1) => {
          const to = index + direction;
          if (to < 0 || to >= visible.length) return;
          const next = [...visible];
          [next[index], next[to]] = [next[to] as string, id];
          let cursor = 0;
          onReorder(
            order.map((item) =>
              visible.includes(item) ? (next[cursor++] as string) : item,
            ),
          );
        };
        const controls = {
          moveUp: () => move(-1),
          moveDown: () => move(1),
          isFirst: index === 0,
          isLast: index === visible.length - 1,
        };
        return id.startsWith("builtin:") ? (
          <SortableSectionShell key={id} sectionId={id}>
            {({ dragHandleProps }) => (
              <OrderContext.Provider value={{ ...controls, dragHandleProps }}>
                {builtins[id]}
              </OrderContext.Provider>
            )}
          </SortableSectionShell>
        ) : (
          <OrderContext.Provider key={id} value={controls}>
            {renderCustom(id, controls)}
          </OrderContext.Provider>
        );
      })}
    </>
  );
}
