# Selective router scrolling candidate

This candidate targets the existing `@tanstack/router-core@1.171.5` without a version change. It is **not registered in pnpm-workspace.yaml or the lockfile and is not enabled in the application router**. Existing installed dependencies are untouched.

The optional `shouldRestoreScrollElement(element)` predicate defaults to accepting every element. A false result skips element tracking, snapshot persistence, carry-forward, cached replay, scroll-to-top selectors and hash scrolling. Window restoration remains unchanged. The candidate application policy excludes descendants of the existing `[data-conversation-view]` host; ordinary routes remain eligible.

The patch includes TypeScript source, both published runtime formats and both type declarations. Source maps are unchanged. It must be installed and qualified from a fresh task-owned frozen dependency setup before activation can receive runtime GO.

The dependency-free test copies six regular package files into an owned temporary directory, applies the candidate there, and executes the actual ESM/CJS restoration functions with controlled router/history/document ports. It does not run a browser or change installed dependencies. All ten cases pass; the unpatched negative baseline passes only the two default-behavior cases and fails the eight selective cases. This proves the controlled module behavior, not DOM geometry, router delivery, scroll timing or pnpm lock correctness.

Next activation step, after source review: register this version-specific patch, update only the matching patch hash/snapshot references with no version changes, and pass `shouldRestoreRouterElement` to the application router. Preserve the existing global scroll-restoration setting and pathname key. Request a fresh captain grant for offline frozen installation, TypeScript and actual router/browser qualification; never reuse an older source packet or grant.
