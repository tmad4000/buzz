import assert from "node:assert/strict";
import { test } from "node:test";
import { act, createElement as h, useState } from "react";
import { EditorContent } from "@tiptap/react";
import { render, waitFor } from "@testing-library/react";

import { syntheticComposerPaste } from "../../../../tests/helpers/syntheticComposerPaste.ts";
import { useRichTextEditor } from "../lib/useRichTextEditor.ts";
import { useComposerPasteHandler } from "./useComposerPasteHandler.ts";

const prefix = "draft-before:";
const suffix = `:draft-after${"s".repeat(8_000)}`;
const noAttachments = () =>
  assert.fail("A text paste must not change attachments");

function clipboardEvent(text, html) {
  const flavors = { "text/plain": text, "text/html": html };
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: { getData: (type) => flavors[type] ?? "", items: [] },
  });
  return event;
}

function caretTextBefore(input) {
  const { anchorNode, anchorOffset, isCollapsed } = document.getSelection();
  assert.equal(isCollapsed, true);
  assert.equal(input.contains(anchorNode), true);
  const range = document.createRange();
  range.selectNodeContents(input);
  range.setEnd(anchorNode, anchorOffset);
  return range.toString();
}

function Fixture({ report, animationFrameCallbacks }) {
  const [length, setLength] = useState(0);
  const { editor } = useRichTextEditor({
    placeholder: "Reply in thread",
    onUpdate: ({ text }) => setLength(text.length),
  });
  useComposerPasteHandler({
    editor,
    setPendingImeta: noAttachments,
    uploadFile: noAttachments,
    // Reproduce the old composer callback when running this regression
    // against the preimage. jsdom itself has no layout or animation frames.
    scrollToBottom: () => {
      animationFrameCallbacks.push(() => {
        const viewport = editor.view.dom.closest("[data-viewport]");
        viewport.scrollTop = viewport.scrollHeight;
      });
    },
  });
  if (editor) report.current = editor;
  return h(
    "div",
    { "data-viewport": "", "data-length": length },
    h(EditorContent, { editor }),
  );
}

for (const size of [20_000, 100_000]) {
  for (const flavor of ["plain", "rich"]) {
    test(`${size}-byte ${flavor} paste leaves the editor and insertion caret in view`, async () => {
      const report = { current: null };
      const animationFrameCallbacks = [];
      const mounted = render(h(Fixture, { report, animationFrameCallbacks }));
      try {
        await waitFor(() => assert.ok(report.current?.view.dom.isConnected));
        const editor = report.current;
        const input = editor.view.dom;
        const viewport = input.closest("[data-viewport]");
        Object.defineProperty(viewport, "scrollHeight", { value: 1200 });
        const caretScrollTop = 800;
        let scrollRequests = 0;
        act(() => {
          editor.commands.setContent({
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: prefix + suffix }],
              },
            ],
          });
          editor.view.focus();
          editor.commands.setTextSelection(prefix.length + 1);
          // jsdom has no layout. Track ProseMirror's actual selection-scroll
          // request and simulate an internal viewport with a long draft tail.
          editor.setOptions({
            editorProps: {
              ...editor.options.editorProps,
              handleScrollToSelection: () => {
                scrollRequests++;
                viewport.scrollTop = caretScrollTop;
                return true;
              },
            },
          });
        });
        assert.equal(caretTextBefore(input), prefix);

        const { text, html } = syntheticComposerPaste(size);
        const event = clipboardEvent(text, flavor === "rich" ? html : "");
        act(() => input.dispatchEvent(event));
        assert.equal(event.defaultPrevented, true);
        assert.equal(scrollRequests, 1);
        const normalized = text.replaceAll("\n", "");
        assert.ok(
          editor.state.doc.textContent === prefix + normalized + suffix,
          "exact content after paste",
        );
        assert.ok(
          caretTextBefore(input) === prefix + normalized,
          "caret is immediately after the paste",
        );
        assert.equal(viewport.scrollTop, caretScrollTop);

        // Flush the component callback's next-frame work separately from
        // ProseMirror's synchronous paste transaction.
        act(() => {
          for (const callback of animationFrameCallbacks.splice(0)) callback();
        });
        assert.equal(editor.view.dom, input);
        assert.equal(document.activeElement, input);
        assert.ok(
          caretTextBefore(input) === prefix + normalized,
          "caret is immediately after the paste",
        );
        if (flavor === "rich") assert.ok(input.querySelector("strong"));
        assert.equal(
          viewport.scrollTop,
          caretScrollTop,
          "paste scroll must follow the insertion, even after the next frame",
        );
      } finally {
        mounted.unmount();
      }
    });
  }
}

test("Buzz code-block paste requests selection scrolling in the insertion transaction", async () => {
  const report = { current: null };
  const animationFrameCallbacks = [];
  const mounted = render(h(Fixture, { report, animationFrameCallbacks }));
  try {
    await waitFor(() => assert.ok(report.current?.view.dom.isConnected));
    const editor = report.current;
    const input = editor.view.dom;
    let selectionScrolled = false;
    act(() => {
      editor.view.focus();
      editor.setOptions({
        editorProps: {
          ...editor.options.editorProps,
          handleScrollToSelection: () => {
            selectionScrolled = true;
            return true;
          },
        },
      });
    });
    const code = "synthetic\nfixture";
    const event = clipboardEvent(
      code,
      `<pre data-buzz-code-block="true"><code>${code}</code></pre>`,
    );
    act(() => input.dispatchEvent(event));

    assert.equal(event.defaultPrevented, true);
    assert.equal(input.querySelector("pre code").textContent, code);
    assert.equal(selectionScrolled, true);
    assert.equal(animationFrameCallbacks.length, 0);
    assert.equal(document.activeElement, input);
  } finally {
    mounted.unmount();
  }
});
