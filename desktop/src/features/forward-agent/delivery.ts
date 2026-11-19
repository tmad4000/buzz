/** A relay-confirmed forward whose local receipt alone needs recovery. */
export class ForwardMarkerError extends Error {}
export function forwardFailureMessage(
  error: unknown,
  publicationStarted: boolean,
) {
  const detail =
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
      ? error.message
      : typeof error === "string"
        ? error
        : "Could not confirm forward.";
  if (
    !publicationStarted ||
    error instanceof ForwardMarkerError ||
    /^relay rejected event:/i.test(detail)
  )
    return detail;
  // Once the mutation starts, an unrecognized error is not evidence of rejection.
  return `${detail} Check the target before retrying.`;
}
