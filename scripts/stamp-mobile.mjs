import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildInfo } from "../desktop/scripts/build-info.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = readFileSync(new URL("../mobile/pubspec.yaml", import.meta.url), "utf8");
// Pass the same build name when Flutter's --build-name overrides pubspec.
const version = process.argv[2] || /^version:\s*([^+\s]+)/m.exec(manifest)?.[1];
if (!version) throw new Error("Mobile version is missing");
const info = buildInfo(root, version);
mkdirSync(new URL("../mobile/assets/", import.meta.url), { recursive: true });
writeFileSync(new URL("../mobile/assets/app-version.json", import.meta.url), `${JSON.stringify(info)}\n`);
