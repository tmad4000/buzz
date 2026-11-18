import { access, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";

const [output, ...requested] = process.argv.slice(2);
if (!output || !requested.length) {
  throw new Error(
    "Usage: node mockup/gallery.mjs <preview directory> <scenario> …",
  );
}
const designs = {
  "send-to-thread": {
    title: "Send to thread v2",
    views: [
      ["", "Picker and hover preview"],
      ["origin", "Origin trace expanded"],
    ],
  },
  "side-agents": {
    title: "Side agents + Page v2",
    views: [
      ["", "Expanded Page and contents"],
      ["docked", "Docked Page"],
      ["association", "Association in the thread"],
    ],
  },
  inbox: {
    title: "Inbox v2",
    views: [
      ["", "Inbox with proposed filters"],
      ["quick-add", "Quick add"],
    ],
  },
  annotations: {
    title: "Annotations margin",
    views: [
      ["", "Thread and margin"],
      ["feedback", "Feedback confirmation"],
    ],
  },
  lanes: {
    title: "Lanes",
    views: [["", "Lanes board"]],
  },
};
const themes = ["light", "dark"];
const cards = [];
for (const id of requested) {
  const design = designs[id];
  if (!design) throw new Error(`Unknown design: ${id}`);
  const views = [];
  for (const [view, label] of design.views) {
    const names = themes.map(
      (theme) => `shots/${id}${view ? `-${view}` : ""}-${theme}.png`,
    );
    const haveShots = await Promise.all(
      names.map((name) =>
        access(join(output, name)).then(
          () => true,
          () => false,
        ),
      ),
    );
    const links = themes.map((theme, index) => {
      const params = new URLSearchParams({ scenario: id, theme });
      if (view) params.set("view", view);
      return `<span class="links"><a href="./mockup.html?${params.toString().replaceAll("&", "&amp;")}">${theme === "light" ? "Light" : "Dark"} live</a>${haveShots[index] ? `<a href="./${names[index]}">PNG</a>` : ""}</span>`;
    });
    views.push(`<li><span>${label}</span><div>${links.join("")}</div></li>`);
  }
  cards.push(
    `<article><h2>${design.title}</h2><ul>${views.join("")}</ul></article>`,
  );
}
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Five Buzz desktop proposals rendered in the Buzz Ideaflow app shell.">
<meta property="og:title" content="Buzz desktop mockups · November 18">
<title>Buzz desktop mockups · November 18</title>
<link rel="icon" href="./buzz.svg">
<style>
  :root{color-scheme:light dark;font:15px/1.55 system-ui,sans-serif;--line:color-mix(in srgb,CanvasText 15%,Canvas);--muted:color-mix(in srgb,CanvasText 66%,Canvas)}
  body{margin:0;color:CanvasText;background:Canvas}
  main{max-width:850px;margin:auto;padding:44px 24px 60px}
  header{border-bottom:1px solid var(--line);padding-bottom:22px;margin-bottom:24px}
  h1{font-size:32px;line-height:1.15;letter-spacing:-.035em;margin:0 0 10px}
  h2{font-size:17px;letter-spacing:-.02em;margin:0 0 7px}
  p{margin:0;color:var(--muted)}
  article{border:1px solid var(--line);border-radius:12px;padding:17px 20px;margin-bottom:12px}
  ul{list-style:none;margin:0;padding:0}
  li{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:8px 0}
  li+li{border-top:1px solid var(--line)}
  li>div{display:flex;gap:12px;flex-wrap:wrap}
  .links{display:inline-flex;gap:7px}
  a{color:CanvasText;text-underline-offset:3px}
  .links>a:first-child{font-weight:600}
  .links>a:nth-child(2){color:var(--muted)}
  footer{margin-top:24px;font-size:13px}
</style>
</head>
<body><main>
<header><h1>Buzz desktop mockups</h1><p>November 18, 2026 · Live previews and 1440 × 960 screenshots</p></header>
${cards.join("\n")}
<footer><a href="./mockup.html?scenario=shell">Desktop fixture shell</a></footer>
</main></body>
</html>`;
await writeFile(join(output, "index.html.tmp"), html);
await rename(join(output, "index.html.tmp"), join(output, "index.html"));
