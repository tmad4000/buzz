# Buzz

Desktop chat shell with:

- Tauri + React + TypeScript + Vite
- Tailwind CSS
- shadcn/ui-ready shared components
- Biome (lint/format/check)
- Feature-driven frontend structure

## Scripts

- `pnpm dev` - run the web frontend
- `pnpm tauri dev` - run the desktop app
- `pnpm build` - typecheck and build frontend
- `pnpm typecheck` - TypeScript checks
- `pnpm lint` - Biome lint
- `pnpm format` - Biome format (write)
- `pnpm check` - Biome check

## Structure

- `src/shared` - reusable app-wide code (`ui`, `lib`, `styles`)
- `src/features` - feature modules (vertical slices)
- `src/app` - top-level app composition

## Programmatic setup for Buzz Ideaflow

For an existing community, first provision the intended Buzz identity through the
app's supported local identity import and sign Claude Code in with a subscription.
Setup uses this local sign-in and verifies the expected public key. Quit Buzz
Ideaflow before running the command so the new process receives the settings.

```sh
BUZZ_SETUP_RELAY=wss://community.example \
BUZZ_SETUP_PUBKEY='64-character-hex-public-key' \
BUZZ_SETUP_CHECK=1 \
"/Applications/Buzz Ideaflow.app/Contents/MacOS/buzz-desktop"
```

Use the public key in quotes in place of the placeholder. Check mode reports
setup readiness to stderr and exits without saving the setup settings. It checks that the identity can read the relay. Remove
`BUZZ_SETUP_CHECK=1` to select Claude Code and reconnect. The app reports
`Connected` when it loads the existing community profile and
`AlreadyConfigured` for a matching saved community and runtime. The desktop
stays open as it does on a normal launch.

If setup reports `ConsentRequired`, complete the community's terms and age
confirmation in the normal Buzz onboarding screen. If the relay needs an
invite or the account needs a profile, use the normal Buzz flow. The command
uses an explicit relay and leaves communities for other identities intact.
