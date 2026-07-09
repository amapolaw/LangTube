import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, "../apps/desktop/src-tauri/icons");

const ICON_BASE =
  "https://raw.githubusercontent.com/refactorlab/drift/main/drift-lab/src-tauri/icons";

const files = [
  "32x32.png",
  "128x128.png",
  "128x128@2x.png",
  "icon.ico",
  "icon.icns",
];

await mkdir(iconsDir, { recursive: true });

for (const file of files) {
  const url = `${ICON_BASE}/${encodeURIComponent(file)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(join(iconsDir, file), buf);
  console.log(`Wrote ${file} (${buf.length} bytes)`);
}

console.log("Tauri icons written to", iconsDir);
