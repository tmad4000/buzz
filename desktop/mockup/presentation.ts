export function waitFor<T extends HTMLElement = HTMLElement>(
  selector: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const observer = new MutationObserver(check);
    const timer = window.setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Buzz scenario timed out waiting for ${selector}`));
    }, 15_000);

    function check() {
      const match = document.querySelector<T>(selector);
      if (!match) return;
      window.clearTimeout(timer);
      observer.disconnect();
      resolve(match);
    }
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });
    check();
  });
}

export async function openThread(channel: string, thread: string) {
  const { router } = await import("@/app/router");
  await router.navigate({
    to: "/channels/$channelId",
    params: { channelId: channel },
    search: { thread },
  });
}
