import { pageExternalLink } from "./sandbox";

const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
const ELEMENTS = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "code",
  "strong",
  "em",
  "br",
  "hr",
  "table",
  "caption",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "a",
]);

function validateContents(parent: Element, depth: number): boolean {
  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType === node.COMMENT_NODE) {
      node.parentNode?.removeChild(node);
      continue;
    }
    if (node.nodeType === node.TEXT_NODE) continue;
    if (node.nodeType !== node.ELEMENT_NODE || depth >= 32) return false;
    const element = node as Element;
    if (
      element.namespaceURI !== HTML_NAMESPACE ||
      !ELEMENTS.has(element.localName)
    )
      return false;
    for (const attr of element.attributes) {
      if (
        element.localName !== "a" ||
        attr.name !== "href" ||
        attr.namespaceURI !== null ||
        !pageExternalLink(attr.value)
      ) {
        return false;
      }
    }
    if (!validateContents(element, depth + 1)) return false;
  }
  return true;
}

/** Extract a unique, self-contained section before rendering it in the Page sandbox. */
export function pageSection(html: string, sectionId: string): string | null {
  const template = document.createElement("template");
  template.innerHTML = html;
  const matches = Array.from(template.content.querySelectorAll("[id]")).filter(
    (element) => element.id === sectionId,
  );
  if (matches.length !== 1) return null;
  const section = matches[0];
  return section.localName === "section" &&
    section.namespaceURI === HTML_NAMESPACE &&
    section.attributes.length === 1 &&
    section.hasAttribute("id") &&
    validateContents(section, 1)
    ? section.outerHTML
    : null;
}
