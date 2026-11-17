import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { ConversationViewContext } from "@/features/conversations/ConversationViewContext";
import { useVisibleThreadReplies } from "./useVisibleThreadReplies.ts";

for (const attribute of ["inert", "aria-hidden", "hidden"])
  for (const position of ["ancestor", "body"])
    test(`${attribute} removal on ${position} re-observes unchanged geometry without an invented observer event`, async () => {
      const originalObserver = globalThis.IntersectionObserver;
      const originalFocus = document.hasFocus;
      const visibility = Object.getOwnPropertyDescriptor(
        document,
        "visibilityState",
      );
      document.hasFocus = () => true;
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "visible",
      });
      const observers = [];
      globalThis.IntersectionObserver = class {
        nodes = [];
        constructor(callback) {
          this.callback = callback;
          observers.push(this);
        }
        observe(target) {
          target.getClientRects = () => [{}];
          this.nodes.push(target);
          // Like the browser: observe() schedules an initial entry even when
          // geometry is unchanged. Attribute removal itself emits no IO event.
          queueMicrotask(() =>
            this.callback([{ target, isIntersecting: true }]),
          );
        }
        disconnect() {
          this.retired = true;
        }
      };
      const calls = [];
      const messages = [{ id: "reply", createdAt: 2 }];
      const reveal = (rows) => calls.push(rows.map((row) => row.id));
      const covered = {
        [attribute]: attribute === "aria-hidden" ? "true" : true,
      };
      function Harness() {
        const ref = React.useRef(null);
        useVisibleThreadReplies(ref, messages, reveal, "root", "same-resource");
        return React.createElement(
          "section",
          {
            "data-cover": "ancestor",
            ...(position === "ancestor" ? covered : {}),
          },
          React.createElement(
            "div",
            { ref },
            React.createElement(
              "article",
              { "data-testid": "message-row", "data-message-id": "reply" },
              React.createElement(
                "div",
                {
                  "data-testid": "message-body",
                  "data-cover": "body",
                  ...(position === "body" ? covered : {}),
                },
                "unchanged reply body",
              ),
            ),
          ),
        );
      }
      const container = document.createElement("div");
      document.body.append(container);
      const root = createRoot(container);
      try {
        await act(async () =>
          root.render(
            React.createElement(
              ConversationViewContext.Provider,
              { value: { viewInstanceId: "a", focused: true, visible: true } },
              React.createElement(Harness),
            ),
          ),
        );
        assert.deepEqual(
          calls,
          [],
          "covered initial entries cannot acknowledge a body",
        );
        const countBeforeUncover = observers.length;
        const cover = container.querySelector(`[data-cover="${position}"]`);
        await act(async () => {
          cover.removeAttribute(attribute);
          await Promise.resolve();
        });
        assert.ok(
          observers.length > countBeforeUncover,
          "attribute change creates a fresh observation",
        );
        assert.deepEqual(
          calls,
          [["reply"]],
          "fresh initial entry resumes observation without scroll, rerender, focus or manual callback",
        );
        await act(async () => {
          cover.setAttribute(
            attribute,
            attribute === "aria-hidden" ? "true" : "",
          );
          await Promise.resolve();
        });
        await act(async () => {
          cover.removeAttribute(attribute);
          await Promise.resolve();
        });
        assert.deepEqual(
          calls,
          [["reply"]],
          "coverage cycling retains this visit's seen dedupe",
        );
      } finally {
        await act(() => root.unmount());
        container.remove();
        globalThis.IntersectionObserver = originalObserver;
        document.hasFocus = originalFocus;
        if (visibility)
          Object.defineProperty(document, "visibilityState", visibility);
        else delete document.visibilityState;
      }
    });
