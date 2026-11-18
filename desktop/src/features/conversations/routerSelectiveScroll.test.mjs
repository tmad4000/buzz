import assert from "node:assert/strict";
import test from "node:test";
import {
  readFileSync,
  mkdirSync,
  copyFileSync,
  mkdtempSync,
  rmSync,
  lstatSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import vm from "node:vm";
import { shouldRestoreRouterElement } from "./routerScrollPolicy.ts";

const require = createRequire(import.meta.url);
const sourceRoot =
  process.env.BUZZ_ROUTER_CORE_SOURCE_ROOT ??
  resolve(dirname(require.resolve("@tanstack/router-core")), "../..");
const pkg = JSON.parse(
  readFileSync(resolve(sourceRoot, "package.json"), "utf8"),
);
assert.equal(pkg.name, "@tanstack/router-core");
assert.equal(pkg.version, "1.171.5");
const directory = mkdtempSync(resolve(tmpdir(), "buzz-router-selective-"));
const files = [
  "src/scroll-restoration.ts",
  "src/router.ts",
  "dist/esm/scroll-restoration.js",
  "dist/cjs/scroll-restoration.cjs",
  "dist/esm/router.d.ts",
  "dist/cjs/router.d.cts",
];
for (const file of files) {
  const source = resolve(sourceRoot, file);
  assert.equal(lstatSync(source).isFile(), true);
  mkdirSync(dirname(resolve(directory, file)), { recursive: true });
  copyFileSync(source, resolve(directory, file));
}
if (!process.env.BUZZ_ROUTER_PATCH_BASELINE) {
  const patch = fileURLToPath(
    new URL(
      "../../../../patches/@tanstack__router-core@1.171.5.patch",
      import.meta.url,
    ),
  );
  const result = spawnSync("git", ["apply", patch], {
    cwd: directory,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
}
process.on("exit", () => rmSync(directory, { recursive: true, force: true }));

function fixture(format, initial = {}, filter = true) {
  const ids = new Map(),
    listeners = new Map(),
    subscriptions = new Map();
  const writes = [];
  let persisted;
  function element(id, pane) {
    const value = {
      isConnected: true,
      scrollLeft: 0,
      _top: 33,
      get scrollTop() {
        return this._top;
      },
      set scrollTop(top) {
        writes.push([id, "top", top]);
        this._top = top;
      },
      getAttribute: (name) =>
        name === "data-scroll-restoration-id" ? id : null,
      closest: (selector) => {
        assert.equal(selector, "[data-conversation-view]");
        return pane ? {} : null;
      },
      scrollTo: (options) => writes.push([id, "reset", options.top]),
      scrollIntoView: () => writes.push([id, "hash"]),
    };
    ids.set(id, value);
    return value;
  }
  const pane = element("pane", true),
    global = element("global", false);
  const document = {
    addEventListener: (kind, callback) => listeners.set(kind, callback),
    querySelector: (selector) =>
      ids.get(/data-scroll-restoration-id="([^"]+)"/.exec(selector)?.[1]),
    getElementById: (id) => ids.get(id),
  };
  const locationHistoryActions = new WeakMap();
  const exports = {};
  const sandbox = {
    document,
    history: {},
    window: {},
    scrollX: 0,
    scrollY: 99,
    scrollTo: (options) => writes.push(["window", "reset", options.top]),
    sessionStorage: {
      getItem: () => JSON.stringify(initial),
      setItem: (_key, value) => {
        persisted = JSON.parse(value);
      },
    },
    addEventListener: (kind, callback) => listeners.set(kind, callback),
    locationHistoryActions,
    isServer: false,
    exports,
    require: (name) => {
      if (name === "./router.cjs") return { locationHistoryActions };
      assert.equal(name, "@tanstack/router-core/isServer");
      return { isServer: false };
    },
  };
  let source = readFileSync(
    resolve(
      directory,
      format === "esm"
        ? "dist/esm/scroll-restoration.js"
        : "dist/cjs/scroll-restoration.cjs",
    ),
    "utf8",
  );
  if (format === "esm") {
    source = source
      .replace(/^import .*;\n/gm, "")
      .replace(/^export \{.*\};\n/gm, "");
    source += "\nexports.setupScrollRestoration = setupScrollRestoration;";
  }
  vm.runInNewContext(source, sandbox);
  const router = {
    options: {
      scrollRestoration: true,
      getScrollRestorationKey: (location) => location.pathname,
      ...(filter
        ? { shouldRestoreScrollElement: shouldRestoreRouterElement }
        : {}),
    },
    resetNextScroll: true,
    latestLocation: { pathname: "/from" },
    subscribe: (kind, callback) => subscriptions.set(kind, callback),
    stores: {
      resolvedLocation: { get: () => router.latestLocation },
      location: { get: () => router.latestLocation },
    },
  };
  exports.setupScrollRestoration(router);
  return {
    pane,
    global,
    writes,
    router,
    rendered: (pathname, { from = "/from", hash = "" } = {}) => {
      const toLocation = { pathname, hash, state: {} };
      router.latestLocation = toLocation;
      locationHistoryActions.set(toLocation, "PUSH");
      subscriptions.get("onRendered")({
        fromLocation: { pathname: from },
        toLocation,
      });
    },
    scroll: (target) => listeners.get("scroll")({ target }),
    save: () => {
      listeners.get("pagehide")();
      return persisted;
    },
  };
}
const selector = (id) => `[data-scroll-restoration-id="${id}"]`;
for (const format of ["esm", "cjs"]) {
  test(`${format}: cached pane entries are skipped while global and window restoration remain`, () => {
    const h = fixture(format, {
      "/to": {
        [selector("pane")]: { scrollX: 0, scrollY: 700 },
        [selector("global")]: { scrollX: 0, scrollY: 400 },
        window: { scrollX: 0, scrollY: 200 },
      },
    });
    h.rendered("/to");
    assert.equal(h.pane.scrollTop, 33);
    assert.equal(h.global.scrollTop, 400);
    assert.ok(h.writes.some(([id, , top]) => id === "window" && top === 200));
  });
  test(`${format}: pane scrolls are not tracked or persisted`, () => {
    const h = fixture(format);
    h.scroll(h.pane);
    h.scroll(h.global);
    const cache = h.save();
    assert.equal(cache["/from"][selector("pane")], undefined);
    assert.equal(cache["/from"][selector("global")].scrollY, 33);
  });
  test(`${format}: carry-forward excludes pane entries`, () => {
    const h = fixture(format, {
      "/from": {
        [selector("pane")]: { scrollX: 0, scrollY: 700 },
        [selector("global")]: { scrollX: 0, scrollY: 400 },
      },
    });
    h.router.resetNextScroll = false;
    h.rendered("/to");
    const cache = h.save();
    assert.equal(cache["/to"][selector("pane")], undefined);
    assert.equal(cache["/to"][selector("global")].scrollY, 400);
  });
  test(`${format}: reset selectors and hashes respect pane ownership`, () => {
    const h = fixture(format);
    h.router.options.scrollToTopSelectors = [() => h.pane, () => h.global];
    h.rendered("/new");
    assert.equal(
      h.writes.some(([id]) => id === "pane"),
      false,
    );
    assert.ok(
      h.writes.some(([id, kind]) => id === "global" && kind === "reset"),
    );
    h.rendered("/pane-hash", { hash: "pane" });
    assert.equal(
      h.writes.some(([id]) => id === "pane"),
      false,
    );
    h.rendered("/global-hash", { hash: "global" });
    assert.ok(
      h.writes.some(([id, kind]) => id === "global" && kind === "hash"),
    );
  });
  test(`${format}: default behavior is unchanged when no predicate is configured`, () => {
    const h = fixture(
      format,
      { "/to": { [selector("pane")]: { scrollX: 0, scrollY: 700 } } },
      false,
    );
    h.rendered("/to");
    assert.equal(h.pane.scrollTop, 700);
  });
}
