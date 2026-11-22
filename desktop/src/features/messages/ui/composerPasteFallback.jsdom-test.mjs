import assert from "node:assert/strict";
import { test } from "node:test";
import { render, waitFor } from "@testing-library/react";
import { Slice } from "@tiptap/pm/model";
import { EditorContent } from "@tiptap/react";
import { act, createElement } from "react";

import { useRichTextEditor } from "../lib/useRichTextEditor.ts";
import { useComposerPasteHandler } from "./useComposerPasteHandler.ts";

const unreadableFile = { kind: "file", getAsFile: () => null };
const noAttachments = () => assert.fail("Paste must not update attachments");
const noSubmit = () => assert.fail("Paste must not submit the composer");

function pasteEvent({ text = "", html = "", items = [] }) {
  const data = { "text/plain": text, "text/html": html };
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: { items, getData: (flavor) => data[flavor] ?? "" },
  });
  return event;
}

function Fixture({ report, uploads }) {
  const { editor } = useRichTextEditor({
    placeholder: "Synthetic message",
    onSubmit: noSubmit,
  });
  useComposerPasteHandler({
    editor,
    setPendingImeta: noAttachments,
    uploadFile: async (file) => {
      uploads.push(file);
    },
  });
  if (editor) report.current = editor;
  return createElement(EditorContent, { editor });
}

async function inComposer(check) {
  const report = { current: null };
  const uploads = [];
  const mounted = render(createElement(Fixture, { report, uploads }));
  try {
    await waitFor(() => assert.ok(report.current?.view.dom.isConnected));
    const { view } = report.current;
    report.current.setOptions({
      editorProps: {
        ...report.current.options.editorProps,
        handleScrollToSelection: () => true,
      },
    });
    await check(view, uploads);
  } finally {
    mounted.unmount();
  }
}

test("unreadable file item leaves plain text available to the composer", async () => {
  await inComposer((view, uploads) => {
    const event = pasteEvent({
      text: "Synthetic plain text",
      items: [unreadableFile],
    });
    act(() => view.dom.dispatchEvent(event));
    assert.equal(event.defaultPrevented, true);
    assert.equal(view.state.doc.textContent, "Synthetic plain text");
    assert.deepEqual(uploads, []);
  });
});

test("unreadable file item leaves HTML-only formatting available", async () => {
  await inComposer((view, uploads) => {
    const event = pasteEvent({
      html: "<p><strong>Synthetic</strong> rich text</p>",
      items: [unreadableFile],
    });
    act(() => view.dom.dispatchEvent(event));
    assert.equal(event.defaultPrevented, true);
    assert.equal(view.state.doc.textContent, "Synthetic rich text");
    assert.equal(view.dom.querySelector("strong")?.textContent, "Synthetic");
    assert.deepEqual(uploads, []);
  });
});

test("unreadable file item preserves a copied checklist's visible markers", async () => {
  await inComposer((view, uploads) => {
    const event = pasteEvent({
      text: "- ☑ Verify synthetic input\n- ☐ Review output",
      html: "<ul><li>☑ Verify synthetic input</li><li>☐ Review output</li></ul>",
      items: [unreadableFile],
    });
    act(() => view.dom.dispatchEvent(event));
    assert.equal(event.defaultPrevented, true);
    assert.equal(view.state.doc.firstChild?.type.name, "bulletList");
    assert.deepEqual(
      Array.from(view.dom.querySelectorAll("ul > li"), (item) => item.textContent),
      ["☑ Verify synthetic input", "☐ Review output"],
    );
    assert.deepEqual(uploads, []);
  });
});

test("file item without a File or supported flavors is left unhandled", async () => {
  await inComposer((view, uploads) => {
    const event = pasteEvent({ items: [unreadableFile] });
    const handled = view.someProp("handlePaste", (handle) =>
      handle(view, event, Slice.empty),
    );
    assert.ok(!handled);
    assert.equal(event.defaultPrevented, false);
    assert.equal(view.state.doc.textContent, "");
    assert.deepEqual(uploads, []);
  });
});

test("first readable file retains the attachment paste path", async () => {
  await inComposer((view, uploads) => {
    const file = new File(["synthetic"], "synthetic.txt", {
      type: "text/plain",
    });
    const event = pasteEvent({
      text: "File preview text",
      items: [unreadableFile, { kind: "file", getAsFile: () => file }],
    });
    act(() => view.dom.dispatchEvent(event));
    assert.equal(event.defaultPrevented, true);
    assert.deepEqual(uploads, [file]);
    assert.equal(view.state.doc.textContent, "");
  });
});
