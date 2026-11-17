import { appBuild } from "@/shared/lib/appBuild";

type FeedbackApi = { ready: boolean; open: () => void };
type FeedbackWindow = Window & {
  WitFeedback?: FeedbackApi;
  __witFeedbackInstalled?: boolean;
  __witFeedbackLoading?: boolean;
};
let loading: Promise<void> | null = null;

/** Load feedback only after the app's menu action; no floating launcher. */
export async function openWitFeedback(): Promise<void> {
  const host = window as FeedbackWindow;
  if (host.WitFeedback?.ready) {
    host.WitFeedback.open();
    return;
  }
  if (!loading) {
    loading = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://worldissuetracker.com/widget/wit-feedback.js";
      Object.assign(script.dataset, {
        trackerSlug: "buzz-ideaflow",
        app: "Buzz Ideaflow",
        appVersion: appBuild.version,
        mode: "feedback",
        trigger: "none",
        sourceUrl: "https://github.com/tmad4000/buzz",
      });
      const started = Date.now();
      const timer = window.setInterval(() => {
        if (host.WitFeedback?.ready) {
          window.clearInterval(timer);
          resolve();
        } else if (Date.now() - started > 15000) fail();
      }, 100);
      const fail = () => {
        window.clearInterval(timer);
        script.remove();
        delete host.WitFeedback;
        host.__witFeedbackInstalled = false;
        host.__witFeedbackLoading = false;
        reject(new Error("Feedback is unavailable. Please retry."));
      };
      script.onerror = fail;
      document.head.append(script);
    }).catch((error) => {
      loading = null;
      throw error;
    });
  }
  await loading;
  host.WitFeedback?.open();
}
