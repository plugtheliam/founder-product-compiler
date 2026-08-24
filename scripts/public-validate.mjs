#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { lstat, readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const required = [
  "LICENSE", "README.md", "package.json", "package-lock.json", "tsconfig.json",
  ".github/workflows/ci.yml", ".github/dependabot.yml",
  ".agents/plugins/marketplace.json", "plugins/founder-product-compiler/.codex-plugin/plugin.json",
  "plugins/founder-product-compiler/skills/founder-product-compiler/SKILL.md",
  "plugins/founder-product-compiler/scripts/founder-product-compiler.mjs",
  "plugins/founder-product-compiler/scripts/runtime/compiler.mjs",
  "plugins/founder-product-compiler/scripts/runtime/validate-artifacts.mjs",
  "plugins/founder-product-compiler/THIRD_PARTY_NOTICES.md",
  "plugins/founder-product-compiler/assets/canonical-input.json",
  "docs/RELEASE_NOTES_v0.1.0.md", "docs/SHOWCASE.md", "docs/ROADMAP.md", "docs/TRANSLATION_GUIDE.md",
  "docs/assets/social-preview.svg", "docs/i18n/README.ko.md", "docs/i18n/README.ja.md",
  "docs/i18n/README.zh-CN.md", "docs/i18n/README.es.md",
];
const forbiddenPath = /(^|\/)(AGENTS\.md|sessions|receipts|blueprint\.md|CODEX_WORK_ORDER\.md|PROJECT\.md|NOW\.md|HANDOFF\.md|TASKS\.md|DECISIONS\.md|SOURCES\.md|node_modules|dist)(\/|$)|\.mcp\.json$|\.app\.json$|^plugins\/marketplace\.json$/i;
const allowText = new Set(["docs/PUBLIC_RELEASE_PLAN.md", "docs/TDD_IMPLEMENTATION_RECEIPT.md", "scripts/public-validate.mjs", "test/public-release.test.mjs"]);

async function walk(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "dist") continue;
    const path = join(directory, entry.name);
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await walk(path, name));
    else files.push(name);
  }
  return files;
}

function parseJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

for (const file of required) {
  try { await lstat(join(root, file)); } catch { throw new Error(`Missing required public file: ${file}`); }
}

const files = await walk(root);
for (const file of files) {
  if (forbiddenPath.test(file)) throw new Error(`Forbidden public path: ${file}`);
  const state = await lstat(join(root, file));
  if (state.isSymbolicLink()) throw new Error(`Symlinks are not allowed: ${file}`);
  if (!allowText.has(file)) {
    const content = await readFile(join(root, file));
    if (content.includes("/home/ubuntu") || content.includes("Context OS") || content.includes("CODEX_WORK_ORDER")) {
      throw new Error(`Private/internal reference in public file: ${file}`);
    }
  }
}

const tracked = execFileSync("git", ["ls-files", "-z", "-co", "--exclude-standard"], { cwd: root }).toString("utf8").split("\0").filter(Boolean);
for (const file of tracked) {
  if (forbiddenPath.test(file)) throw new Error(`Forbidden tracked path: ${file}`);
}
const packageJson = parseJson(join(root, "package.json"));
if (packageJson.license !== "Apache-2.0" || packageJson.author?.name !== "plugtheliam") throw new Error("Public package identity/license is incorrect");
const manifest = parseJson(join(root, "plugins/founder-product-compiler/.codex-plugin/plugin.json"));
if (manifest.author?.name !== "plugtheliam" || manifest.license !== "Apache-2.0" || manifest.mcpServers || manifest.apps) throw new Error("Plugin manifest is not a public skills-only manifest");
const marketplace = parseJson(join(root, ".agents/plugins/marketplace.json"));
if (marketplace.plugins?.[0]?.source?.path !== "./plugins/founder-product-compiler") throw new Error("Marketplace source path is incorrect");
const workflow = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
for (const match of workflow.matchAll(/uses:\s*([^\s#]+)/g)) {
  if (!/@[0-9a-f]{40}$/i.test(match[1])) throw new Error(`CI action is not pinned to a full commit SHA: ${match[1]}`);
}
const pluginNotices = readFileSync(join(root, "plugins/founder-product-compiler/THIRD_PARTY_NOTICES.md"), "utf8");
for (const packageName of ["yaml", "ajv", "fast-deep-equal", "fast-uri", "json-schema-traverse"]) {
  if (!pluginNotices.includes(`## ${packageName} `)) throw new Error(`Missing bundled runtime notice: ${packageName}`);
}
process.stdout.write(`Public validation passed (${tracked.length} tracked files).\n`);
