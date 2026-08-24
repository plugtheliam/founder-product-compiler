#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { main as compileMain } from "./runtime/compiler.mjs";
import { validateArtifacts } from "./runtime/validate-artifacts.mjs";

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function usage() {
  return [
    "Usage: founder-product-compiler --input <brief.json|brief.yaml> --out <directory> [--compact] [--force]",
    "",
    "Compiles a founder brief, validates every emitted artifact, and preserves the compiler exit contract:",
    "  0  READY",
    "  2  NOT_READY",
    "  1  input, compiler, output, or validation error",
    "",
    "Existing artifact files are never replaced unless --force is provided.",
  ].join("\n");
}

function argumentValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value\n\n${usage()}`);
  }
  return value;
}

function parseArgs(argv) {
  const options = { compact: false, force: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      return { help: true };
    }
    if (arg === "--compact") {
      options.compact = true;
      continue;
    }
    if (arg === "--force") {
      options.force = true;
      continue;
    }
    if (arg === "--input" || arg === "-i") {
      options.input = argumentValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--input=")) {
      options.input = arg.slice("--input=".length);
      if (!options.input) throw new Error(`--input requires a value\n\n${usage()}`);
      continue;
    }
    if (arg === "--out" || arg === "-o") {
      options.out = argumentValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--out=")) {
      options.out = arg.slice("--out=".length);
      if (!options.out) throw new Error(`--out requires a value\n\n${usage()}`);
      continue;
    }
    throw new Error(`Unknown argument\n\n${usage()}`);
  }
  if (!options.input) throw new Error(`--input is required\n\n${usage()}`);
  if (!options.out) throw new Error(`--out is required\n\n${usage()}`);
  return options;
}

async function reportError(error, code = "ARTIFACT_VALIDATION_ERROR") {
  const message = safeErrorMessage(error);
  process.stderr.write(`${JSON.stringify({
    verdict: "NOT_READY",
    diagnostics: [{ code, severity: "error", path: "/", message }],
  }, null, 2)}\n`);
}

function safeErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/^(Artifact directory must be a real directory|Artifact directory resolves through a symlink|Unsafe artifact path for [A-Za-z][A-Za-z0-9]*; (?:expected a known basename|path escapes the artifact directory|symlinks are not allowed|artifact must be a regular file))$/.test(message)) {
    return message;
  }
  return "Artifact validation failed";
}

async function run(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    return 1;
  }
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }

  // Normalize invocation-relative paths before changing cwd for the bundled
  // validator, whose schema lookup is intentionally plugin-local.
  const inputPath = resolve(process.cwd(), options.input);
  const outputPath = resolve(process.cwd(), options.out);
  process.chdir(pluginRoot);

  let compilerCode;
  try {
    compilerCode = await compileMain([
      "--input",
      inputPath,
      "--out",
      outputPath,
      ...(options.compact ? ["--compact"] : []),
      ...(options.force ? ["--force"] : []),
    ]);
  } catch (error) {
    await reportError(error, "CLI_ERROR");
    return 1;
  }
  if (compilerCode === 1) return 1;

  try {
    await validateArtifacts(outputPath);
  } catch (error) {
    await reportError(error);
    return 1;
  }

  // Keep the compiler's READY/NOT_READY code as the final result after the
  // validator has confirmed the emitted bundle.
  return compilerCode === 0 ? 0 : 2;
}

const exitCode = await run();
process.exitCode = exitCode;
