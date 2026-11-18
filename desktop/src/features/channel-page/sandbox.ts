/** Only Buzz's fixed link bridge can execute. Author JavaScript is disabled offline. */
const LINK_BRIDGE = `document.addEventListener('click', function(event) {
 const link = event.target.closest && event.target.closest('a,area');
 if (!link) return;
 event.preventDefault(); event.stopImmediatePropagation();
 const href = link.getAttribute('href') || link.getAttribute('xlink:href');
 if (!event.isTrusted || !href) return;
 if (href.startsWith('#')) { const target = document.getElementById(href.slice(1)); if (target) target.scrollIntoView(); return; }
 if (href.startsWith('https://') || href.startsWith('http://')) parent.postMessage({type:'buzz-page-link',href}, '*');
}, true);
document.addEventListener('keydown', function(event) {
 if (!event.isTrusted || event.defaultPrevented || event.repeat) return;
 if (event.key === 'Escape') parent.postMessage({type:'buzz-page-shortcut',action:'restore'}, '*');
 if (event.metaKey && event.shiftKey && event.key.toLowerCase() === 'f') {
   event.preventDefault();
   parent.postMessage({type:'buzz-page-shortcut',action:'toggle'}, '*');
 }
});
window.addEventListener('message', function(event) {
 const message = event.data;
 if (event.source !== parent || message?.type !== 'buzz-page-scroll' ||
     typeof message.id !== 'string' || message.id.length > 8192) return;
 const target = document.getElementById(message.id);
 if (target?.matches('h1,h2,h3')) target.scrollIntoView();
});`;
export const PAGE_CSP =
  "default-src 'none'; script-src 'sha256-p5hNdtAelzX0+WSJJm5UtK0GwlW3hhpnFD1iRkK89yY='; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; media-src data:; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
export type PageHeading = {
  id: string;
  level: number;
  text: string;
};

/** Prepare the sandbox and its outline from the same inert, sanitized DOM. */
export function pageDocument(html: string) {
  // A template is inert: parsing must not start image/frame requests before CSP applies.
  const template = document.createElement("template");
  template.innerHTML = html;
  // Refresh is navigation, which default-src does not govern. Author scripts could
  // navigate too, so strip them and use a hash policy rather than unsafe-inline.
  for (const node of template.content.querySelectorAll(
    "script, meta[http-equiv], base",
  ))
    node.remove();
  const headings = collectHeadings(template.content);
  const srcDoc = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${PAGE_CSP}"><meta name="referrer" content="no-referrer"><script>${LINK_BRIDGE}</script></head><body>${template.innerHTML}</body></html>`;
  return { srcDoc, headings };
}

function collectHeadings(content: DocumentFragment): PageHeading[] {
  const firstById = new Map<string, Element>();
  for (const element of content.querySelectorAll("[id]")) {
    if (!firstById.has(element.id)) firstById.set(element.id, element);
  }
  const headings: PageHeading[] = [];
  const nextSuffix = new Map<string, number>();
  for (const heading of content.querySelectorAll("h1,h2,h3")) {
    const label = heading.textContent?.replace(/\s+/g, " ").trim();
    if (!label) continue;
    const text = Array.from(label).slice(0, 120).join("");
    if (
      !heading.id ||
      heading.id.length > 8192 ||
      firstById.get(heading.id) !== heading
    ) {
      const slug =
        text
          .toLowerCase()
          .normalize("NFKD")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 64) || "section";
      let suffix = nextSuffix.get(slug) ?? 1;
      while (firstById.has(`${slug}-${suffix}`)) suffix++;
      heading.id = `${slug}-${suffix}`;
      nextSuffix.set(slug, suffix + 1);
      firstById.set(heading.id, heading);
    }
    headings.push({ id: heading.id, level: Number(heading.tagName[1]), text });
    if (headings.length === 200) break;
  }
  return headings;
}
/** Validate even messages sent directly by untrusted Page scripts. */
export function pageExternalLink(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 8192) return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
