# Buzz Auto-route v0 fixture

Build from the pinned desktop workspace.

```sh
pnpm -C desktop exec vite build --config auto-route-demo/vite.config.ts
```

Serve the static `desktop/dist-auto-route-demo` output on an isolated preview origin. Open `/auto-route-demo.html?autoRoute=1`. The flag defaults off, and the ordinary Buzz build has no fixture entry or slots. The preview uses the Buzz mockup kit’s approach: the actual desktop shell, thread and composer backed by the in-memory E2E Tauri bridge, with a restrictive CSP and the kit’s navigation guard.

| Try in the fixture thread | Expected result |
| --- | --- |
| What’s a release candidate? | One complete inline answer with simulated model, host, and elapsed client timing |
| Ask a smarter model | A simulated Paseo root receipt linked to the same prompt, with the first answer retained |
| Which build is on M3? | A simulated Paseo root receipt with the current-state reason |
| Deploy it | A simulated handoff receipt that says action and deployment approval are needed |
| Choose GPT for this message and send | One GPT handoff via simulated root, then the composer returns to the thread default |
| Pin Instant and ask about M3 | An explicit offer to send to Paseo root |
| Select Notify off, then change the model | The fixture notification choice stays off |

Use `&theme=dark` for the other theme. Use `&case=pinned`, `&case=unverified`, `&case=budget`, or `&case=root-unavailable` to replay a saved GPT pin, an unavailable read, a budget refusal, or a failed first root handoff that can be retried.

The Item 14 presentation follows the reader’s formatter and the producer’s reviewed source-design semantics. In this fixture, a verified no-pin choice displays Auto, an explicit pin is configuration intent, and unavailable settings remain unverified. Auto is never stored as a model identifier. The .11 composition has no Item 14 header consumer yet, so the demo mounts its chip in the real thread header through a fixture-only slot. Session state and replies are synthetic and in memory. The Celeris adapter and root receipts have no transport, credentials or usage billing. Client timing includes simulated delays. Native authority, notifications and provider latency require separate qualification.

## Quick Question

Use the **Quick** toggle in the thread composer or open **Quick-line** in the sidebar. A leading `?` or `q:` also activates Quick for that send. Quick overrides the model pin for the current message and clears on acceptance. The Quick-line dialog sends to the same fixture thread and keeps its own draft.

Try `? What is an ABI?` for a simulated Celeris-1 prose answer and `q: Is 17 a prime number?` for a typed GPT-6 Luna Decisions fixture. Both skip triage. The inline answer's **Go deeper** button creates one simulated Paseo root follow-up. A budget refusal, action request, missed deadline, or unavailable answer stays inline until you explicitly ask root. The demo never calls either provider or runs actions.
