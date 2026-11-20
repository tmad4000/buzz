import assert from "node:assert/strict";
import { test } from "node:test";
import { pageDocument } from "./sandbox.ts";
import { pageSection } from "./pageSection.ts";

test("only the exact result section is passed through the standard Page sandbox", () => {
  const html = `
    <section id="project">Project</section>
    <section id="result-brief"><h1>Brief</h1><!--omitted--></section>
    <section id="result-other">Other result</section>
  `;
  const document = pageDocument(pageSection(html, "result-brief"));
  assert.match(document, /<h1>Brief<\/h1>/);
  assert.doesNotMatch(document, /publish\(\)|Other result|>Project</);
});

test("missing, ambiguous and non-section anchors do not display a whole Page", () => {
  assert.equal(pageSection("<p>Project</p>", "result-brief"), null);
  assert.equal(
    pageSection('<div id="result-brief"></div>', "result-brief"),
    null,
  );
  assert.equal(
    pageSection(
      '<section id="result-brief"></section><h1 id="result-brief">Duplicate</h1>',
      "result-brief",
    ),
    null,
  );
});

test("rejects unsafe or oversized section structure before creating sandbox content", () => {
  for (const html of [
    '<section id="result-brief"><script>publish()</script></section>',
    '<section id="result-brief"><p onclick="x()">Heading</p></section>',
    '<section id="result-brief"><a href="javascript:void(0)">Bad</a></section>',
    '<section id="result-brief"><svg><a>Wrong namespace</a></svg></section>',
    `<section id="result-brief">${"<em>".repeat(32)}x${"</em>".repeat(32)}</section>`,
  ]) {
    assert.equal(pageSection(html, "result-brief"), null);
  }
});
