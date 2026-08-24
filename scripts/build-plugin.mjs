#!/usr/bin/env node

import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(new URL("..", import.meta.url).pathname);
const pluginRoot = join(root, "plugins", "founder-product-compiler");
const runtimeRoot = join(pluginRoot, "scripts", "runtime");
const generated = [
  "scripts/runtime/compiler.mjs",
  "scripts/runtime/validate-artifacts.mjs",
  "schemas/compilation-receipt.schema.json",
  "schemas/diagnostics.schema.json",
  "schemas/executable-spec.schema.json",
  "schemas/goal-dag.schema.json",
  "schemas/product-ir.partial.schema.json",
  "schemas/product-ir.schema.json",
  "schemas/readiness.schema.json",
];

async function esbuild(entry, outfile, requireName, namedExport) {
  const binary = join(root, "node_modules", ".bin", process.platform === "win32" ? "esbuild.cmd" : "esbuild");
  execFileSync(binary, [entry, "--bundle", "--platform=node", "--format=esm", "--target=node20", "--define:process.env.LOG_STREAM=false", "--define:process.env.LOG_TOKENS=false", "--define:node_process.env.LOG_STREAM=false", "--define:node_process.env.LOG_TOKENS=false", '--banner:js=import { createRequire } from "node:module"; const require = createRequire(import.meta.url); const module = {};', `--outfile=${outfile}`], {
    cwd: root,
    stdio: "inherit",
  });
  // TypeScript source is compiled as CommonJS. Esbuild exposes that entry as
  // a default CommonJS namespace, so retain a stable ESM named export for the
  // tiny plugin wrapper without changing compiler source semantics.
  let content = await readFile(outfile, "utf8");
  content = content
    .replace(/^[ \t]*if \(node_process\.env\.LOG_STREAM\)\r?\n[ \t]*console\.dir\(token, \{ depth: null \}\);\r?\n/gm, "")
    .replace(/^[ \t]*if \(node_process\.env\.LOG_TOKENS\)\r?\n[ \t]*console\.log\("\|", cst\.prettyToken\(source\)\);\r?\n/gm, "");
  if (/\bLOG_(?:STREAM|TOKENS)\b/.test(content)) {
    throw new Error(`Bundled runtime retains YAML debug logging path: ${outfile}`);
  }
  const marker = `export default require_${requireName}();`;
  if (!content.includes(marker)) throw new Error(`Bundled entry did not contain expected export marker: ${requireName}`);
  const replacement = `const bundled_${requireName} = require_${requireName}();\nexport const ${namedExport} = bundled_${requireName}.${namedExport};\nexport default bundled_${requireName};`;
  await writeFile(outfile, content.replace(marker, replacement));
}

async function copyGenerated(destination) {
  await cp(join(root, "schemas"), join(destination, "schemas"), { recursive: true });
  await esbuild(join(root, "dist/src/cli.js"), join(destination, "scripts/runtime/compiler.mjs"), "cli", "main");
  await esbuild(join(root, "dist/scripts/validate-artifacts.js"), join(destination, "scripts/runtime/validate-artifacts.mjs"), "validate_artifacts", "validateArtifacts");
}

async function checkGenerated() {
  const scratch = await mkdtemp(join(tmpdir(), "fpc-plugin-build-"));
  try {
    await cp(pluginRoot, scratch, { recursive: true });
    const candidate = join(scratch, "founder-product-compiler");
    await copyGenerated(candidate);
    for (const file of generated) {
      const expected = await readFile(join(candidate, file));
      const actual = await readFile(join(pluginRoot, file));
      if (!expected.equals(actual)) throw new Error(`Generated plugin artifact is stale: ${file}`);
    }
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

async function main() {
  const check = process.argv.includes("--check");
  if (check) {
    await checkGenerated();
    process.stdout.write("Generated plugin artifacts are current.\n");
    return;
  }
  await copyGenerated(pluginRoot);
  process.stdout.write("Generated tracked plugin runtime and schemas from compiler source.\n");
}

await main();
