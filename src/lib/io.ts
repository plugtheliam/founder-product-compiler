import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { basename } from "node:path";
import { parseDocument as parseYamlDocument } from "yaml";
import { assertStructuredValueLimits, INPUT_LIMITS, ProductInputError } from "./schema";

export interface BoundedFileReadOptions {
  label: string;
  onLimit?: () => Error;
}

const READ_FLAGS = constants.O_RDONLY | (typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0);

/**
 * Read a regular file through a bounded, no-follow handle where the platform
 * provides O_NOFOLLOW. The path checks are only a preflight; the handle stat
 * is the authority for the actual read and is checked again afterwards.
 */
export async function readRegularFileBounded(path: string, maxBytes: number, options: BoundedFileReadOptions): Promise<string> {
  const before = await lstat(path);
  if (before.isSymbolicLink()) throw new Error(`${options.label} may not be a symlink`);
  if (!before.isFile()) throw new Error(`${options.label} must be a regular file`);
  if (before.size > maxBytes) throw options.onLimit?.() ?? new Error(`${options.label} exceeds the maximum byte limit`);

  const handle = await open(path, READ_FLAGS);
  try {
    const opened = await handle.stat();
    if (!opened.isFile()) throw new Error(`${options.label} must be a regular file`);
    if (opened.size > maxBytes) throw options.onLimit?.() ?? new Error(`${options.label} exceeds the maximum byte limit`);
    const source = await readHandleBounded(handle, maxBytes, options);
    const after = await handle.stat();
    if (!after.isFile()) throw new Error(`${options.label} must be a regular file`);
    if (after.size > maxBytes) throw options.onLimit?.() ?? new Error(`${options.label} exceeds the maximum byte limit`);
    return source;
  } finally {
    await handle.close();
  }
}

async function readHandleBounded(handle: Awaited<ReturnType<typeof open>>, maxBytes: number, options: BoundedFileReadOptions): Promise<string> {
  const buffer = Buffer.allocUnsafe(maxBytes + 1);
  let offset = 0;
  while (offset < buffer.length) {
    const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
    if (bytesRead === 0) break;
    offset += bytesRead;
    if (offset > maxBytes) throw options.onLimit?.() ?? new Error(`${options.label} exceeds the maximum byte limit`);
  }
  return buffer.subarray(0, offset).toString("utf8");
}

export async function readStructuredFile(path: string): Promise<unknown> {
  const source = await readRegularFileBounded(path, INPUT_LIMITS.maxBytes, {
    label: "Input file",
    onLimit: () => new ProductInputError("Input exceeds the maximum byte limit", "/", "INPUT_LIMIT_EXCEEDED"),
  });
  return parseStructuredText(source, path);
}

export function parseStructuredText(source: string, sourcePath = "input"): unknown {
  if (Buffer.byteLength(source, "utf8") > INPUT_LIMITS.maxBytes) {
    throw new ProductInputError("Input exceeds the maximum byte limit", "/", "INPUT_LIMIT_EXCEEDED");
  }
  assertJsonLikeSourceDepth(source);
  const safeSource = basename(sourcePath) || "input";
  try {
    const value = JSON.parse(source);
    assertStructuredValueLimits(value);
    return value;
  } catch (jsonError) {
    if (jsonError instanceof ProductInputError) throw jsonError;
    try {
      const value = parseYamlWithoutDebugOutput(source);
      assertStructuredValueLimits(value);
      return value;
    } catch (yamlError) {
      if (yamlError instanceof ProductInputError) throw yamlError;
      if (isYamlAliasLimitError(yamlError)) {
        throw new ProductInputError("Input exceeds the maximum YAML alias limit", "/", "INPUT_LIMIT_EXCEEDED");
      }
      throw new ProductInputError(
        `Could not parse ${safeSource} as JSON or YAML`,
        "/",
      );
    }
  }
}

/** Reject deeply nested JSON/flow-YAML before the parser builds an object graph. */
function assertJsonLikeSourceDepth(source: string): void {
  const trimmed = source.trimStart();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return;
  let depth = 0;
  let quote: '"' | "'" | undefined;
  let escaped = false;
  for (const character of source) {
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\" && quote === '"') {
        escaped = true;
      } else if (character === quote) {
        quote = undefined;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "{" || character === "[") {
      depth += 1;
      if (depth > INPUT_LIMITS.maxDepth) {
        throw new ProductInputError("Input exceeds the maximum nesting depth", "/", "INPUT_LIMIT_EXCEEDED");
      }
    } else if (character === "}" || character === "]") {
      depth = Math.max(0, depth - 1);
    }
  }
}

function isYamlAliasLimitError(error: unknown): boolean {
  return error instanceof ReferenceError && /alias count|alias resolution/i.test(error.message);
}

/** Parse untrusted YAML with library debug logging disabled. */
function parseYamlWithoutDebugOutput(source: string): unknown {
  const streamKey = ["LOG", "STREAM"].join("_");
  const tokensKey = ["LOG", "TOKENS"].join("_");
  const previousStream = process.env[streamKey];
  const previousTokens = process.env[tokensKey];
  delete process.env[streamKey];
  delete process.env[tokensKey];
  try {
    const document = parseYamlDocument(source, {
      logLevel: "silent",
      prettyErrors: false,
    });
    if (document.errors.length > 0) throw new Error("Invalid YAML");
    return document.toJS({ maxAliasCount: INPUT_LIMITS.maxYamlAliases });
  } finally {
    if (previousStream === undefined) delete process.env[streamKey];
    else process.env[streamKey] = previousStream;
    if (previousTokens === undefined) delete process.env[tokensKey];
    else process.env[tokensKey] = previousTokens;
  }
}

export function serializeArtifact(value: unknown, pretty = true): string {
  return `${JSON.stringify(value, null, pretty ? 2 : 0)}\n`;
}
