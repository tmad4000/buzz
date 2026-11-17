/** Only Buzz's fixed link bridge can execute. Author JavaScript is disabled offline. */
const LINK_BRIDGE = `document.addEventListener('click', function(event) {
 const link = event.target.closest && event.target.closest('a,area');
 if (!link) return;
 event.preventDefault(); event.stopImmediatePropagation();
 const href = link.getAttribute('href') || link.getAttribute('xlink:href');
 if (!event.isTrusted || !href) return;
 if (href.startsWith('#')) { const target = document.getElementById(href.slice(1)); if (target) target.scrollIntoView(); return; }
 if (href.startsWith('https://') || href.startsWith('http://')) parent.postMessage({type:'buzz-page-link',href}, '*');
}, true);`;
export const PAGE_CSP =
  "default-src 'none'; script-src 'sha256-IfRkfubpC97dNSmIZE4pwWQJfp0RlfPFU83hJlJfJUs='; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; media-src data:; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
export function pageDocument(html: string): string {
  // A template is inert: parsing must not start image/frame requests before CSP applies.
  const template = document.createElement("template");
  template.innerHTML = html;
  // Refresh is navigation, which default-src does not govern. Author scripts could
  // navigate too, so strip them and use a hash policy rather than unsafe-inline.
  for (const node of template.content.querySelectorAll(
    "script, meta[http-equiv], base",
  ))
    node.remove();
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${PAGE_CSP}"><meta name="referrer" content="no-referrer"><script>${LINK_BRIDGE}</script></head><body>${template.innerHTML}</body></html>`;
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
