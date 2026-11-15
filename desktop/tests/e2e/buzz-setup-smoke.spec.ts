import { expect, test } from "@playwright/test";
import { installMockBridge } from "../helpers/bridge";

const relayUrl = "wss://setup.example.test";
const pubkey = "deadbeef".repeat(8);
type SetupWindow = Window & {
  isTauri: boolean;
  setupReports: string[];
  __TAURI_INTERNALS__?: object;
  __BUZZ_E2E_INVOKE_MOCK_COMMAND__: (
    command: string,
    payload: unknown,
  ) => Promise<number>;
};

for (const scenario of ["connect", "consent", "check", "wrong-identity"]) {
  test(scenario, async ({ page }) => {
    await installMockBridge(
      page,
      {
        profileHasEvent: true,
        acpRuntimesCatalog: [
          {
            id: "claude",
            label: "Claude Code",
            availability: "available",
            command: "claude",
            auth_status: { status: "logged_in" },
          },
        ],
      },
      { skipOnboardingSeed: true, skipCommunitySeed: true },
    );
    await page.addInitScript(
      ({ relayUrl, pubkey, scenario }) => {
        const w = window as unknown as SetupWindow;
        w.isTauri = true;
        w.setupReports = [];
        const internals = w.__TAURI_INTERNALS__ ?? {};
        type Invoke = (
          command: string,
          args: { status?: string; config?: unknown } | undefined,
          ...rest: unknown[]
        ) => unknown;
        let invoke: Invoke;
        const configKey = "programmatic-setup-test-config";
        Object.defineProperty(internals, "invoke", {
          get: () =>
            ((command, args, ...rest) => {
              switch (command) {
                case "get_setup_request":
                  return Promise.resolve({
                    relayUrl,
                    pubkey:
                      scenario === "wrong-identity" ? "a".repeat(64) : pubkey,
                    checkOnly: scenario === "check",
                  });
                case "report_setup_status":
                  if (args?.status) w.setupReports.push(args.status);
                  return Promise.resolve();
                case "has_claude_subscription":
                  return Promise.resolve(true);
                case "check_setup_relay_access":
                  return Promise.resolve();
                case "fetch_join_policy":
                  return Promise.resolve(
                    scenario === "consent"
                      ? {
                          age_attestation_required: true,
                          terms_markdown: "Terms for the fixture.",
                          version: "1",
                        }
                      : null,
                  );
                case "get_global_agent_config": {
                  const saved = localStorage.getItem(configKey);
                  return saved
                    ? Promise.resolve(JSON.parse(saved))
                    : invoke(command, args, ...rest);
                }
                case "set_global_agent_config":
                  return Promise.resolve(invoke(command, args, ...rest)).then(
                    (result) => {
                      localStorage.setItem(
                        configKey,
                        JSON.stringify(args?.config),
                      );
                      return result;
                    },
                  );
                default:
                  return invoke(command, args, ...rest);
              }
            }) satisfies Invoke,
          set: (value: Invoke) => {
            invoke = value;
          },
        });
        w.__TAURI_INTERNALS__ = internals;
      },
      { relayUrl, pubkey, scenario },
    );
    await page.goto("/");
    const reports = () =>
      page.evaluate(
        () => (window as unknown as SetupWindow).setupReports as string[],
      );
    const configWrites = () =>
      page.evaluate(() =>
        (window as unknown as SetupWindow).__BUZZ_E2E_INVOKE_MOCK_COMMAND__(
          "get_global_agent_config_set_call_count",
          null,
        ),
      );
    if (scenario === "connect") {
      await expect.poll(reports).toContain("connected");
      expect(await configWrites()).toBe(1);
      await page.reload();
      await expect.poll(reports).toContain("already_configured");
      expect(await configWrites()).toBe(0);
    } else {
      const expected = {
        consent: "consent_required",
        check: "ready_to_connect",
        "wrong-identity": "identity_unavailable",
      }[scenario];
      await expect.poll(reports).toContain(expected);
      expect(await configWrites()).toBe(0);
    }
  });
}
