function blockExternalLink(event: Event) {
  const anchor = event
    .composedPath()
    .find(
      (target) =>
        target instanceof HTMLAnchorElement || target instanceof SVGAElement,
    );
  const href =
    anchor?.getAttribute("href") ?? anchor?.getAttribute("xlink:href");
  if (!href) return;

  try {
    const url = new URL(href, document.baseURI);
    if (url.protocol === location.protocol && url.origin === location.origin)
      return;
  } catch {
    // A destination that cannot be parsed has no place in the fixture.
  }

  event.preventDefault();
  event.stopImmediatePropagation();
}

/** Keep browser navigation inside the fixture, including keyboard activation. */
export function installMockupNavigationGuard() {
  for (const type of ["click", "auxclick", "contextmenu", "dragstart"]) {
    window.addEventListener(type, blockExternalLink, { capture: true });
  }
}
