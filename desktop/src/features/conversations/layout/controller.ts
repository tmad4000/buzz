import {
  closePane,
  createConversationView,
  createLayoutId,
  createSingleLayout,
  focusPane,
  listPanes,
  navigateView,
  orientGroup,
  resizeGroup,
  splitPane,
  swapPanes,
  updateViewPresentation,
  type ConversationLayout,
  type ConversationView,
  type CreateId,
  type SplitAxis,
} from "./model";
import { canSplit, type Size } from "./geometry";
import { ConversationVisitCache } from "./visitCache";
import {
  restoreLayout,
  saveLayout,
  SESSION_ONLY_MESSAGE,
  type LayoutScope,
  type LayoutStorage,
} from "./storage";

export type LayoutControllerSnapshot = {
  layout: ConversationLayout;
  canRestore: boolean;
  recovery: ReturnType<typeof restoreLayout>["status"];
  message: string | null;
};
type Options = {
  /** Construct only after canonical scope and authorization are ready. */
  scope: LayoutScope;
  storage: LayoutStorage;
  initialChannelId: string;
  isCurrentScope: () => boolean;
  /** Live, existing authorized stream/DM target; never create/join here. */
  canOpen: (channelId: string) => boolean;
  /** Resolve edit/upload/voice safeguards for the outgoing instance, even in background. */
  canLeave: (view: ConversationView) => boolean;
  ids?: CreateId;
  saveDelayMs?: number;
};

/** One authorized workspace lifetime. Canonical resources/drafts and compact projection live elsewhere. */
export class ConversationLayoutController {
  private snapshot: LayoutControllerSnapshot;
  private savedSplit: ConversationLayout | null = null;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private dirty = false;
  private revision = 0;
  private visits = new Map<string, number>();
  private presentations = new ConversationVisitCache();
  private ids: CreateId;
  private options: Options;

  constructor(options: Options) {
    // Copy scope: mutation by a caller must not redirect a later persistence write.
    this.options = { ...options, scope: { ...options.scope } };
    this.ids = options.ids ?? createLayoutId;
    if (!options.isCurrentScope() || !options.canOpen(options.initialChannelId))
      throw new Error(
        "Conversation layout requires an authorized initial target",
      );
    const restored = restoreLayout(options.storage, this.options.scope);
    this.snapshot = {
      layout:
        restored.layout ??
        createSingleLayout(
          createConversationView(options.initialChannelId, this.ids),
          this.ids,
        ),
      canRestore: false,
      recovery: restored.status,
      message: restored.status === "unavailable" ? SESSION_ONLY_MESSAGE : null,
    };
    // Inaccessible saved targets remain placeholders; restoration does not fetch or navigate them.
    for (const view of Object.values(this.snapshot.layout.views))
      this.visits.set(view.id, 0);
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private current() {
    return !this.disposed && this.options.isCurrentScope();
  }
  private publish() {
    for (const listener of this.listeners) listener();
  }
  private change(layout: ConversationLayout, deferSave = false) {
    if (!this.current() || layout === this.snapshot.layout) return false;
    this.revision += 1;
    this.snapshot = {
      ...this.snapshot,
      layout,
      canRestore: this.savedSplit !== null,
    };
    const retained = new Set([
      ...Object.keys(layout.views),
      ...Object.keys(this.savedSplit?.views ?? {}),
    ]);
    for (const id of this.visits.keys()) {
      if (!retained.has(id)) this.visits.delete(id);
    }
    this.presentations.retain(retained);
    this.dirty = true;
    if (deferSave) {
      if (this.timer !== null) clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.timer = null;
        this.flush();
      }, this.options.saveDelayMs ?? 150);
    } else this.flush();
    this.publish();
    return true;
  }
  /** A dialog may synchronously switch scope or mutate layout. Recheck both afterward. */
  private allowLeaving(views: ConversationView[]) {
    const revision = this.revision;
    for (const view of views) {
      if (
        !this.current() ||
        !this.options.canLeave(view) ||
        revision !== this.revision
      )
        return false;
    }
    return this.current() && revision === this.revision;
  }
  focus(paneId: string) {
    return this.change(focusPane(this.snapshot.layout, paneId));
  }
  open(
    paneId: string,
    channelId: string,
    axis: SplitAxis,
    bounds: Size,
    viewport: number,
  ) {
    if (!this.current() || !this.options.canOpen(channelId)) return false;
    const layout = this.snapshot.layout;
    const panes = listPanes(layout.root);
    const target = panes.find((pane) => pane.id === paneId);
    if (!target) return false;
    if (panes.length === 2)
      return this.navigate(target.viewInstanceId, channelId);
    if (!canSplit(bounds, axis, viewport)) return false;
    const source = layout.views[target.viewInstanceId];
    const view = createConversationView(
      channelId,
      this.ids,
      source.channelId === channelId ? source : undefined,
    );
    const next = splitPane(layout, paneId, view, axis, this.ids);
    if (next === layout) return false;
    this.visits.set(view.id, 0);
    return this.change(next);
  }
  navigate(
    viewId: string,
    channelId: string,
    presentation?: Parameters<typeof navigateView>[3],
  ) {
    if (!this.current() || !this.options.canOpen(channelId)) return false;
    const layout = this.snapshot.layout;
    const outgoing = layout.views[viewId];
    if (
      !outgoing ||
      !this.allowLeaving([outgoing]) ||
      !this.options.canOpen(channelId) ||
      !this.current()
    )
      return false;
    // Only admitted navigation may change recency or evict another remembered chat.
    this.presentations.remember(outgoing);
    const restored =
      presentation ?? this.presentations.recall(viewId, channelId);
    // Fence A -> B -> A callbacks, which a channel-ID-only comparison cannot distinguish.
    this.visits.set(viewId, (this.visits.get(viewId) ?? 0) + 1);
    const pane = listPanes(layout.root).find(
      (candidate) => candidate.viewInstanceId === viewId,
    );
    const next = focusPane(
      navigateView(layout, viewId, channelId, restored),
      pane?.id ?? layout.focusedPaneId,
    );
    this.presentations.remember(next.views[viewId]);
    return this.change(next);
  }
  /** Capture at render time; use for delayed panel/anchor persistence callbacks. */
  visitToken(viewId: string) {
    return this.visits.get(viewId);
  }
  update(
    viewId: string,
    channelId: string,
    visit: number | undefined,
    patch: Parameters<typeof updateViewPresentation>[3],
  ) {
    if (
      !this.current() ||
      visit === undefined ||
      this.visits.get(viewId) !== visit
    )
      return false;
    return this.change(
      updateViewPresentation(this.snapshot.layout, viewId, channelId, patch),
    );
  }
  close(paneId: string, wholeSplit = false) {
    if (!this.current()) return false;
    const layout = this.snapshot.layout;
    const panes = listPanes(layout.root);
    const pane = panes.find((candidate) => candidate.id === paneId);
    if (!pane || panes.length < 2) return false;
    const removed = wholeSplit
      ? panes.filter((candidate) => candidate.id !== paneId)
      : [pane];
    if (
      !this.allowLeaving(
        removed.map((candidate) => layout.views[candidate.viewInstanceId]),
      )
    )
      return false;
    this.savedSplit = layout;
    let next = layout;
    for (const candidate of removed) {
      next = closePane(next, candidate.id);
      // Re-created views must never accept callbacks from the old mounted visit.
      this.visits.set(
        candidate.viewInstanceId,
        (this.visits.get(candidate.viewInstanceId) ?? 0) + 1,
      );
    }
    return this.change(next);
  }
  restore() {
    if (!this.current() || !this.savedSplit) return false;
    const saved = this.savedSplit;
    const current = this.snapshot.layout;
    const outgoing = Object.values(current.views).filter(
      (view) => saved.views[view.id]?.channelId !== view.channelId,
    );
    if (!this.allowLeaving(outgoing)) return false;
    const views = { ...saved.views };
    // Keep edits to surviving presentations since Close split; closed views use the snapshot.
    for (const view of Object.values(current.views)) {
      if (views[view.id]?.channelId === view.channelId) views[view.id] = view;
    }
    const focused = listPanes(saved.root).find(
      (pane) =>
        pane.viewInstanceId ===
        listPanes(current.root).find(
          (pane) => pane.id === current.focusedPaneId,
        )?.viewInstanceId,
    );
    this.savedSplit = null;
    return this.change({
      ...saved,
      views,
      focusedPaneId: focused?.id ?? saved.focusedPaneId,
    });
  }
  swap(first: string, second: string) {
    return this.change(swapPanes(this.snapshot.layout, first, second));
  }
  orient(axis: SplitAxis, bounds: Size, viewport: number) {
    const layout = this.snapshot.layout;
    return layout.root.kind === "group" && canSplit(bounds, axis, viewport)
      ? this.change(orientGroup(layout, layout.root.id, axis))
      : false;
  }
  resize(groupId: string, sizes: number[], commit: boolean) {
    const changed = this.change(
      resizeGroup(this.snapshot.layout, groupId, sizes),
      !commit,
    );
    // Pointerup can carry the same final ratio as the preceding pointermove.
    if (commit) this.flush();
    return changed;
  }
  flush = () => {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.current() || !this.dirty) return;
    this.dirty = false;
    const result = saveLayout(
      this.options.storage,
      this.options.scope,
      this.snapshot.layout,
    );
    const messageChanged = result.message !== this.snapshot.message;
    this.snapshot = { ...this.snapshot, message: result.message };
    if (messageChanged) this.publish();
  };
  dispose() {
    this.flush();
    this.disposed = true;
    this.listeners.clear();
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
