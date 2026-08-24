import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "..");

const requiredFiles = [
  ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".github/ISSUE_TEMPLATE/feature_request.yml",
  ".github/ISSUE_TEMPLATE/translation.yml",
  ".github/ISSUE_TEMPLATE/config.yml",
  ".github/PULL_REQUEST_TEMPLATE.md",
  "docs/RELEASE_NOTES_v0.1.0.md",
  "docs/SHOWCASE.md",
  "docs/ROADMAP.md",
  "docs/assets/social-preview.svg",
];

test("public launch community files exist", async () => {
  await Promise.all(requiredFiles.map(async (file) => {
    await assert.doesNotReject(readFile(resolve(root, file)), file);
  }));
});

test("issue forms and pull requests set a useful contribution contract", async () => {
  const bug = await readFile(resolve(root, ".github/ISSUE_TEMPLATE/bug_report.yml"), "utf8");
  const feature = await readFile(resolve(root, ".github/ISSUE_TEMPLATE/feature_request.yml"), "utf8");
  const translation = await readFile(resolve(root, ".github/ISSUE_TEMPLATE/translation.yml"), "utf8");
  const pullRequest = await readFile(resolve(root, ".github/PULL_REQUEST_TEMPLATE.md"), "utf8");

  for (const form of [bug, feature, translation]) {
    assert.match(form, /description:/i);
  }
  const config = await readFile(resolve(root, ".github/ISSUE_TEMPLATE/config.yml"), "utf8");
  assert.match(config, /contact_links:/i);
  assert.match(config, /issues\/new\/choose/);
  assert.match(bug, /reproduction|steps/i);
  assert.match(feature, /problem|use case/i);
  assert.match(translation, /locale|language/i);
  assert.match(pullRequest, /tests|verification/i);
  assert.match(pullRequest, /security|secrets/i);
});

test("social preview is a valid 1280 by 640 SVG with the product pipeline", async () => {
  const svg = await readFile(resolve(root, "docs/assets/social-preview.svg"), "utf8");
  assert.match(svg, /<svg\b[^>]*\bwidth=["']1280["'][^>]*\bheight=["']640["']/i);
  assert.match(svg, /Founder Product Compiler/);
  for (const label of ["Founder Brief", "Product IR", "Readiness", "Goal DAG", "Codex"]) {
    assert.match(svg, new RegExp(label));
  }
  assert.doesNotMatch(svg, /<script\b/i);
});

test("showcase and roadmap use truthful, navigable launch language", async () => {
  const showcase = await readFile(resolve(root, "docs/SHOWCASE.md"), "utf8");
  const roadmap = await readFile(resolve(root, "docs/ROADMAP.md"), "utf8");
  const releaseNotes = await readFile(resolve(root, "docs/RELEASE_NOTES_v0.1.0.md"), "utf8");
  assert.match(showcase, /canonical|example/i);
  assert.match(showcase, /examples\/canonical-input\.json/);
  assert.match(roadmap, /Now|Next|Later/i);
  assert.match(roadmap, /benchmark|evidence|measurement/i);
  assert.match(releaseNotes, /v0\.1\.0/);
  assert.match(releaseNotes, /verified.*SHA|RELEASE_COMMIT/i);
  for (const document of [showcase, roadmap, releaseNotes]) {
    assert.doesNotMatch(document, /OpenAI[- ]endorsed|official OpenAI plugin|guaranteed to outperform/i);
  }
  assert.doesNotMatch(showcase, /product-judge report/i);
  assert.match(showcase, /does not emit[\s\S]*product-judge\.json/i);
  assert.doesNotMatch(releaseNotes, /Product judgment across code|user journey.*product thesis/i);
  assert.match(releaseNotes, /added after that tag[\s\S]*not claimed to be part of the v0\.1\.0 payload/i);
});
