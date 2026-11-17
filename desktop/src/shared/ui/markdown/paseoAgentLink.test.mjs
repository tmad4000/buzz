import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { defaultUrlTransform } from "react-markdown";
import { isPaseoAgentLink } from "./paseoAgentLink.ts";
import { buzzDeepLinkUrlTransform } from "./utils.ts";

const id = "075fe138-b9c6-4277-80d6-addd30e38cf3";
const link = `paseo://h/srv_KIFHQ_zsBnI2/agent/${id}`;

test("actual Markdown transform preserves canonical local and remote session hrefs", () => {
  for (const server of [
    "srv_KIFHQ_zsBnI2",
    "srv_uvq8mbWTDr9Y",
    "srv_xmGYpGqxNnXR",
  ]) {
    const value = `paseo://h/${server}/agent/${id}`;
    assert.equal(isPaseoAgentLink(value), true);
    assert.equal(buzzDeepLinkUrlTransform(value, "href"), value);
    assert.equal(
      buzzDeepLinkUrlTransform(value, "src"),
      defaultUrlTransform(value),
    );
  }
});

test("arbitrary schemes, other Paseo actions and malformed routes stay sanitized", () => {
  for (const value of [
    "javascript:alert(1)",
    "paseo://settings",
    "paseo://h/srv_KIFHQ_zsBnI2/agent/new",
    `${link}\n`,
    `${link}?action=send`,
    `${link}#prompt`,
    `${link}/extra`,
    link.replace("/h/", "/user@h/"),
    link.replace("/h/", "/h:123/"),
    link.replace("075fe138", "%30%37%35fe138"),
    link.replace(id, id.toUpperCase()),
    link.replace("srv_KIFHQ_zsBnI2", "srv_a"),
    `\t${link}`,
  ]) {
    assert.equal(isPaseoAgentLink(value), false, JSON.stringify(value));
    assert.equal(
      buzzDeepLinkUrlTransform(value, "href"),
      defaultUrlTransform(value),
    );
  }
  assert.equal(
    buzzDeepLinkUrlTransform("https://example.com/", "href"),
    "https://example.com/",
  );
});

// Bind the actual component callbacks, with only native IO and React hooks faked.
const require = createRequire(import.meta.url);
function anchor(props, openUrl) {
  const source = fs.readFileSync(
    new URL("./ExternalLinkAnchor.tsx", import.meta.url),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    require(name) {
      if (name === "react")
        return { useState: () => [null, () => {}], useCallback: (f) => f };
      if (name === "@tauri-apps/plugin-opener") return { openUrl };
      if (name === "sonner") return { toast: { error: () => {} } };
      if (name === "./MediaContextMenu")
        return { useDismissMediaContextMenu: () => {} };
      if (name === "./paseoAgentLink") return { isPaseoAgentLink };
      if (name === "@/shared/lib/cn") return { cn: () => "" };
      if (name === "@/shared/lib/clipboard") return {};
      if (name === "./MaskedLinkTooltip")
        return { MaskedLinkTooltip: () => null };
      return require(name);
    },
  });
  const element = module.exports.ExternalLinkAnchor({
    anchorProps: {},
    label: "Agent",
    ...props,
  });
  return element.props.children[0].props.children;
}

test("production link click opens exact session through native opener and respects cancellation", async () => {
  const opened = [];
  const open = async (value) => opened.push(value);
  let prevented = false;
  anchor({ href: link }, open).props.onClick({
    defaultPrevented: false,
    preventDefault() {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  assert.deepEqual(opened, [link]);
  for (const props of [
    { href: link },
    { href: "https://example.com/" },
    { href: "paseo://settings" },
  ]) {
    const before = opened.length;
    anchor(props, open).props.onClick({
      defaultPrevented: true,
      preventDefault() {
        throw Error("unexpected");
      },
    });
    assert.equal(opened.length, before);
  }
  let parentCalled = false;
  const event = {
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
  anchor(
    {
      href: link,
      anchorProps: {
        onClick(e) {
          parentCalled = true;
          e.preventDefault();
        },
      },
    },
    open,
  ).props.onClick(event);
  assert.equal(parentCalled, true);
  assert.equal(opened.length, 1);
});

test("native capability only grants the main window's canonical agent route", () => {
  const directory = new URL(
    "../../../../src-tauri/capabilities/",
    import.meta.url,
  );
  const capability = JSON.parse(
    fs.readFileSync(new URL("paseo-agent-links.json", directory), "utf8"),
  );
  assert.deepEqual(capability.windows, ["main"]);
  assert.deepEqual(capability.permissions, [
    {
      identifier: "opener:allow-open-url",
      allow: [
        { url: "paseo://h/srv_*/agent/????????-????-????-????-????????????" },
      ],
    },
  ]);
  const defaults = JSON.parse(
    fs.readFileSync(new URL("default.json", directory), "utf8"),
  );
  assert.ok(defaults.permissions.includes("opener:default"));
});
