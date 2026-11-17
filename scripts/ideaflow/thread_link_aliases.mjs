import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

// Production-only aliases for the pure projector. No test stubs or UI loader.
const root = fileURLToPath(new URL("../../desktop/src/", import.meta.url));
const allowed = new Set([
  "features/messages/lib/threading.ts",
  "features/messages/lib/threadLinks.ts",
  "features/messages/lib/threadLinkProjection.ts",
  "shared/lib/authors.ts",
  "shared/lib/pubkey.ts",
  "shared/lib/nostrUtils.ts",
]);

export function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const relative = `${specifier.slice(2)}.ts`;
    if (!allowed.has(relative))
      throw new Error("Unsupported thread-link alias");
    return next(pathToFileURL(path.join(root, relative)).href, context);
  }
  if (specifier.startsWith("./") && context.parentURL?.startsWith("file:")) {
    const candidate = path.resolve(
      path.dirname(fileURLToPath(context.parentURL)),
      `${specifier}.ts`,
    );
    if (allowed.has(path.relative(root, candidate)) && existsSync(candidate)) {
      return next(pathToFileURL(candidate).href, context);
    }
  }
  return next(specifier, context);
}
