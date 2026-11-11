/**
 * Release body for the tag-driven workflow.
 *
 * A curated `docs/release-notes/v<version>.md` wins, because it is the only way
 * to get the bilingual (English + collapsible 中文说明) notes right. Without it,
 * the body is generated from the commits since the previous v* tag so a release
 * is never shipped with an empty description.
 *
 * Usage: node .github/scripts/release-notes.mjs <version> <out.md>
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const [version, out] = process.argv.slice(2);
if (!version || !out) {
  console.error("usage: release-notes.mjs <version> <out.md>");
  process.exit(2);
}

const curated = path.join("docs", "release-notes", `v${version}.md`);
if (fs.existsSync(curated)) {
  fs.copyFileSync(curated, out);
  console.log(`notes: ${curated} (${fs.statSync(out).size} bytes)`);
  process.exit(0);
}

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();

let previous = "";
try {
  // Tags reachable from HEAD, newest first, excluding this release's own tag.
  // Tags are the bare version (no "v"), because the community directory matches the
  // release against manifest.json verbatim.
  previous = git("tag", "--list", "[0-9]*", "--sort=-v:refname")
    .split("\n")
    .filter((t) => t && t !== version && t !== `v${version}`)[0] ?? "";
} catch {
  previous = "";
}

const range = previous ? `${previous}..HEAD` : "HEAD";
const subjects = git("log", range, "--no-merges", "--pretty=format:- %s (%h)")
  .split("\n")
  .filter(Boolean);

const repo = process.env.GITHUB_REPOSITORY ?? "XijlI/endnote-cite";
const name = version;

const body = `Cite as you write from your EndNote library, then export to Word or LaTeX.

![EndNote Cite in Obsidian](https://raw.githubusercontent.com/${repo}/main/docs/screenshot.png)

## What's new in ${name}

${subjects.length ? subjects.join("\n") : "- Maintenance release."}

## Install

1. Unzip \`endnote-cite-${version}.zip\` into \`<your vault>/.obsidian/plugins/endnote-cite/\` —
   the \`bridge/\` folder must sit next to \`main.js\`, the EndNote-field export needs it.
2. **Settings → Community plugins → Reload**, then enable **EndNote Cite**.
3. Point the plugin at your \`.enl\` file and pick a style.

\`SHA256SUMS.txt\` covers every asset in this release.

${
  previous
    ? `**Full changelog**: https://github.com/${repo}/compare/${previous}...${version}`
    : ""
}
`;

fs.writeFileSync(out, body, "utf8");
console.log(`notes: generated from ${range} (${subjects.length} commits)`);
