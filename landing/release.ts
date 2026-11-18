// Where the free downloads live. Everything is served from GitHub Releases; this site only links out.
//
// Set VITE_GITHUB_REPO in Vercel (Project → Settings → Environment Variables), e.g. "octocat/tab-muncher",
// or change the fallback below. `releases/latest/download/<file>` always points at the newest release,
// so these names must match the files uploaded by `npm run release:package` (see README).
export const GITHUB_REPO: string = import.meta.env.VITE_GITHUB_REPO || "YOUR-GITHUB-USERNAME/tab-muncher";

export const ASSET_NAMES = {
  exe: "Tab-Muncher-Setup.exe",
  msi: "Tab-Muncher.msi",
  extension: "tab-muncher-extension.zip",
} as const;

/** Folder name users get after extracting the extension zip. */
export const EXTENSION_FOLDER = "tab-muncher-extension";

const latest = (file: string) => `https://github.com/${GITHUB_REPO}/releases/latest/download/${file}`;

export const LINKS = {
  exe: latest(ASSET_NAMES.exe),
  msi: latest(ASSET_NAMES.msi),
  extension: latest(ASSET_NAMES.extension),
  releases: `https://github.com/${GITHUB_REPO}/releases/latest`,
  repo: `https://github.com/${GITHUB_REPO}`,
};
