export function shouldShowSidebarUpdateCard(status: { state: string }) {
  return (
    status.state === "available" ||
    status.state === "downloading" ||
    status.state === "ready" ||
    status.state === "installing" ||
    status.state === "manual-required"
  );
}
