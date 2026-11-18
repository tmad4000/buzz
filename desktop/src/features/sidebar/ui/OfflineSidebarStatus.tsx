import { useQuery } from "@tanstack/react-query";
import { useDeviceOffline } from "@/shared/api/offlineConnection";
/** Cached list/badge provenance belongs beside the sidebar, independent of the focused pane. */
export function OfflineSidebarStatus() {
  const offline = useDeviceOffline();
  const source = useQuery<{ savedAt: number }>({
    queryKey: ["offline-source", "channels"],
    queryFn: () => ({ savedAt: 0 }),
    enabled: false,
  });
  if (!offline) return null;
  return (
    <div role="status" className="px-3 py-2 text-xs text-muted-foreground">
      {source.data
        ? `Offline · cached list as of ${new Date(source.data.savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
        : "Offline · showing loaded channels"}
    </div>
  );
}
