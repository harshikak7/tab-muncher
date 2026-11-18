// Collects everything a GitHub Release needs into ./release with the stable file names the
// landing page links to (see landing/release.ts):
//
//   release/Tab-Muncher-Setup.exe       ← src-tauri/target/release/bundle/nsis/*-setup.exe
//   release/Tab-Muncher.msi             ← src-tauri/target/release/bundle/msi/*.msi
//   release/tab-muncher-extension.zip   ← chrome-extension/ (extracts to tab-muncher-extension/)
//
// Run `npm run tauri build` first, then `npm run release:package`. Windows only (uses PowerShell to zip).
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = join(root, "release");
const bundle = join(root, "src-tauri", "target", "release", "bundle");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

function copyNewest(dir, test, dest) {
  const from = join(bundle, dir);
  const files = existsSync(from) ? readdirSync(from).filter(test).sort() : [];
  if (!files.length) {
    console.warn(`! no ${dir} installer found in ${from} (run \`npm run tauri build\` first)`);
    return;
  }
  cpSync(join(from, files.at(-1)), join(out, dest));
  console.log(`✓ ${dest}  (from ${files.at(-1)})`);
}

copyNewest("nsis", (f) => f.endsWith("-setup.exe"), "Tab-Muncher-Setup.exe");
copyNewest("msi", (f) => f.endsWith(".msi"), "Tab-Muncher.msi");

// Zip the extension inside a named folder so "Extract All" gives users tab-muncher-extension/.
const stage = join(tmpdir(), `tab-muncher-ext-${Date.now()}`);
const folder = join(stage, "tab-muncher-extension");
cpSync(join(root, "chrome-extension"), folder, { recursive: true });
const zip = join(out, "tab-muncher-extension.zip");
execFileSync(
  "powershell.exe",
  ["-NoProfile", "-NonInteractive", "-Command", `Compress-Archive -Path '${folder}' -DestinationPath '${zip}' -Force`],
  { stdio: "inherit" },
);
rmSync(stage, { recursive: true, force: true });
console.log("✓ tab-muncher-extension.zip");
console.log(`\nUpload the files in ${out} to a new GitHub Release.`);
