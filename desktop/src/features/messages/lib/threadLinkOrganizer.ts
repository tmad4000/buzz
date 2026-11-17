import type { ThreadLinkScope } from "./threadLinks";

/** Fetch the current roster in the captured scope before granting Jacob's override. */
export async function captureThreadOrganizerScope(
  scope: ThreadLinkScope,
  members: (
    channel: string,
    options: { readYourWrites: true },
  ) => Promise<Array<{ pubkey: string }>>,
  current: () => boolean,
  signal: AbortSignal,
): Promise<ThreadLinkScope> {
  const roster = await members(scope.channelId, { readYourWrites: true });
  if (!current() || signal.aborted)
    throw new DOMException("Thread organization scope changed", "AbortError");
  return {
    ...scope,
    jacobIsChannelMember: roster.some(
      (member) => member.pubkey === JACOB_THREAD_ORGANIZER,
    ),
  };
}

/** Explicit local organizer policy; arbitrary channel members gain no grant. */
export const JACOB_THREAD_ORGANIZER =
  "3eb6491e9fecd5e2c0221f76b79685a1478b591bf90ea155f5352ebe12672e1f";

/** Called only after fresh signed-envelope/original verification by the projector. */
export function threadLinkSignerAllowed(
  signer: string,
  childAuthor: string,
  scope: ThreadLinkScope,
): boolean {
  return (
    signer === childAuthor ||
    (signer === JACOB_THREAD_ORGANIZER && scope.jacobIsChannelMember === true)
  );
}
