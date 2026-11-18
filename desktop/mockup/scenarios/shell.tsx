import { CHANNEL, JACOB, NORA, SOL, channels, message } from "../fixtures";
import { waitFor } from "../presentation";
import type { Scenario } from "../runtime";

export default {
  title: "Desktop shell",
  channels,
  messages: {
    [CHANNEL]: [
      message(
        1,
        JACOB,
        "Can we review the desktop flow before sharing it?",
        32,
      ),
      message(
        2,
        SOL,
        "The fixture is ready. Try opening this thread, switching to Home, or clicking an author to inspect their profile.",
        29,
        { root: 1 },
      ),
      message(
        3,
        NORA,
        "The review will cover the channel, composer, and thread panel.",
        12,
      ),
    ],
  },
  async prepare() {
    await waitFor('[data-testid="message-row"]');
  },
} satisfies Scenario;
