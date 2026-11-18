/** Unavailable cached history is a recoverable offline state, never an empty live result. */
export class OfflineReadUnavailableError extends Error {
  constructor(message = "Not available offline") {
    super(message);
    this.name = "OfflineReadUnavailableError";
  }
}
