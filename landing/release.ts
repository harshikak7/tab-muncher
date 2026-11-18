export const GITHUB_REPO: string = import.meta.env.VITE_GITHUB_REPO || "harshikak7/tab-muncher";

export const ASSET_NAMES = {
  exe: "Tab.Muncher_0.1.0_x64-setup.exe",
  msi: "Tab.Muncher_0.1.0_x64_en-US.msi",
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