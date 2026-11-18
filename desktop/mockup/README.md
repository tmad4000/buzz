# Buzz desktop mockup kit

This separate Vite entry boots the Buzz Ideaflow desktop app from the release 8 source with the existing desktop E2E Tauri/relay mock. It uses the real sidebar, conversation header, timeline, composer, thread panel, Inbox, profile controls, and channel Page component. The fixture document blocks external resource loads and connections with CSP. The release feed and relay capability probe return fixtures.

## Run and capture

From a checkout with its pinned workspace dependencies installed:

```sh
cd desktop
pnpm mockup
pnpm mockup:check
```

Open `/mockup.html?scenario=shell&theme=light` on the preview server. Use `theme=dark` for the other Buzz palette and `present=0` to skip an example's scripted opening actions. To share with your tailnet, pass `--host <tailnet-ip> --port <free-port>` to `pnpm mockup`. The command serves the compiled preview directory.

```sh
pnpm mockup:build
pnpm mockup:shots "$PREVIEW_URL" "$PREVIEW_DIR/shots" send-to-thread send-to-thread:origin side-agents side-agents:docked side-agents:association inbox inbox:quick-add annotations annotations:feedback lanes
pnpm mockup:index "$PREVIEW_DIR" send-to-thread side-agents inbox annotations lanes
```

Copy the contents of `dist-mockup/` into the dedicated preview directory. Serve that copy from a private address. Captures use installed Chrome's sandbox through the pinned Playwright dependency, run at 1440 × 960 in both themes, and fail on console errors or external network attempts.

## Add a scenario

Create one file under `scenarios/` and open `/mockup.html?scenario=<file-stem>`. The default export implements `Scenario` from `runtime.tsx`.

- Set `title`, the initial desktop `route` if needed, and fixture events, profiles, Page data or Inbox rows.
- Provide only the proposed UI in named `slots`. A sidebar, channel header, timeline, composer, message, thread, Page and Inbox can each take mockup content. Use the app's shared Button, sidebar and dialog primitives and its Tailwind theme tokens.
- Use `prepare(view)` for a capture's specific state. Wait for the real UI before interacting with it. Leave the controls interactive afterward.

The mockup-only Vite plugin attaches the slots to explicit source anchors. A mismatched anchor fails the mockup build. Product source and the normal Vite build do not import this entry, these slots, or these fixtures. Fixture sends are handled by the E2E in-memory IPC bridge.

The checked-in Lanes scenario has a synthetic sample. This task's private P2 Lanes dataset belongs in the ignored `mockup/private/lanes.json` path, in the projected shape declared in `scenarios/lanes.tsx`. Keep that file and its compiled output on authorized private infrastructure. The other design fixtures are synthetic.
