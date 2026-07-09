import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, "../apps/desktop/src-tauri/icons");

// Minimal valid 32x32 PNG (solid #2563eb)
const png32 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAHUlEQVR42u3OMQEAAAgDINc/9K3hQwAAAAAAAAAAAPBuB6AAAW4q0kQAAAAASUVORK5CYII=",
  "base64"
);

// Minimal valid 128x128 PNG (same pixel scaled metadata stub)
const png128 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAADElEQVR42u3BMQEAAADCoPVP7WsIoAAAAAAAAAAAeAN1+AABNf0k0QAAAABJRU5ErkJggg==",
  "base64"
);

// Minimal valid ICO (32x32, 1-bit)
const ico = Buffer.from(
  "AAABAAEAEBAAAAEAIABoBAAAFgAAACgAAAAQAAAAIAAAAAEAIAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///8A////AP///wD///wAAAAA",
  "base64"
);

await mkdir(iconsDir, { recursive: true });
await writeFile(join(iconsDir, "32x32.png"), png32);
await writeFile(join(iconsDir, "128x128.png"), png128);
await writeFile(join(iconsDir, "128x128@2x.png"), png128);
await writeFile(join(iconsDir, "icon.ico"), ico);
await writeFile(join(iconsDir, "icon.icns"), png128);
console.log("Tauri placeholder icons written to", iconsDir);
