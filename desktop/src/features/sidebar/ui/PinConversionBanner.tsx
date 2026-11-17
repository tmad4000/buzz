import { useEffect, useRef, useState } from "react";
import type { ChannelSection } from "../lib/channelSectionsStorage";
import { pinSectionOffers } from "../lib/sidebarSectionOrder";
import { MAX_CHANNEL_STAR_ENTRIES } from "../lib/channelStarsStorage";
import { useSidebarStars } from "./SidebarStars";

/** Additive conversion journals intent before starring; any device can retry it. */
export function PinConversionBanner({
  sections,
  assignments,
  handled,
  pending,
  onConvert,
  onHandled,
}: {
  sections: ChannelSection[];
  assignments: Record<string, string>;
  handled: Record<string, boolean>;
  pending: Record<string, string[]>;
  onConvert: (id: string, ids: string[]) => void;
  onHandled: (id: string) => void;
}) {
  const stars = useSidebarStars();
  const [failed, setFailed] = useState(false);
  const attempted = useRef(new Map<string, string>());
  useEffect(() => {
    if (!stars) return;
    for (const [id, ids] of Object.entries(pending)) {
      if (handled[id]) continue;
      const fingerprint = JSON.stringify(ids);
      if (attempted.current.get(id) !== fingerprint) {
        attempted.current.set(id, fingerprint);
        void Promise.resolve()
          .then(() => stars.star(ids))
          .then((confirmed) => {
            if (confirmed === true) onHandled(id);
            else setFailed(true);
          });
      }
    }
  }, [pending, handled, stars, onHandled]);
  const offer = pinSectionOffers(sections, handled)[0];
  if (!offer || !stars) return null;
  const queued = pending[offer.id];
  const ids =
    queued ??
    Object.keys(assignments).filter((id) => assignments[id] === offer.id);
  const full = new Set([...stars.ids, ...ids]).size > MAX_CHANNEL_STAR_ENTRIES;
  return (
    <section
      className="mx-2 rounded-md border border-sidebar-border p-3 text-xs"
      aria-label="Convert Pin to Starred"
    >
      <p>Convert {offer.name} → Starred?</p>
      <p className="mt-1 text-sidebar-foreground/60">
        Add these conversations to Starred. Your section stays intact. Pinned
        messages inside conversations are separate.
      </p>
      {queued ? (
        <p className="mt-1" role="status">
          Conversion saved for retry. Your section is safe.
        </p>
      ) : null}
      {failed && queued ? (
        <p role="alert">
          Conversion is waiting for synchronization or available Starred
          capacity. Retry when connected and space is available.
        </p>
      ) : null}
      {full ? (
        <p role="alert">
          Starred is full. Unstar some conversations before converting this
          section.
        </p>
      ) : null}
      <div className="mt-2 flex gap-3">
        <button
          type="button"
          disabled={full}
          className="underline disabled:opacity-50"
          onClick={() => {
            if (queued)
              void Promise.resolve()
                .then(() => stars.star(ids))
                .then((confirmed) => {
                  if (confirmed === true) onHandled(offer.id);
                  else setFailed(true);
                });
            else onConvert(offer.id, ids);
          }}
        >
          {queued ? "Retry conversion" : "Convert Pin → Starred"}
        </button>
        <button
          type="button"
          disabled={!!queued}
          className="underline disabled:opacity-50"
          onClick={() => onHandled(offer.id)}
        >
          Keep section as is
        </button>
      </div>
    </section>
  );
}
