import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sdkPkg = join(root, "node_modules", "@cursor", "sdk", "package.json");
const webSdkPkg = join(root, "apps", "web", "node_modules", "@cursor", "sdk", "package.json");

if (!existsSync(sdkPkg) && !existsSync(webSdkPkg)) {
  console.log("[ensure-deps] 未找到 @cursor/sdk，正在执行 pnpm install …");
  execSync("pnpm install", { cwd: root, stdio: "inherit" });
}
