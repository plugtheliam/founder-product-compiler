#!/usr/bin/env node
import {
  constants,
  closeSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  linkSync,
  openSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { mkdir, lstat, realpath } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, join, parse, resolve, sep } from "node:path";
import { compileFounderBrief } from "./lib/compiler";
import { serializeArtifact, readStructuredFile } from "./lib/io";
import { ProductInputError } from "./lib/schema";

interface CliOptions {
  input?: string;
  out?: string;
  pretty: boolean;
  force: boolean;
}

interface VerifiedOutputDirectory {
  requestedPath: string;
  realPath: string;
  dev: number;
  ino: number;
}

const DIRECTORY_OPEN_FLAGS = constants.O_RDONLY
  | (typeof constants.O_DIRECTORY === "number" ? constants.O_DIRECTORY : 0)
  | (typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0);

// This hook is intentionally test-only API. It lets the regression suite move
// an ancestor after the directory has been anchored, without weakening the
// production path or relying on timing-sensitive races.
let outputAnchorTestHook: (() => void) | undefined;

export function setOutputAnchorTestHookForTests(hook: (() => void) | undefined): void {
  outputAnchorTestHook = hook;
}

function usage(): string {
  return [
    "Usage: fpc --input <brief.json|brief.yaml> [--out <directory>] [--compact] [--force]",
    "",
    "The command writes Product IR, readiness, executable spec, Goal DAG, and a receipt.",
    "It exits nonzero when readiness is NOT_READY.",
  ].join("\n");
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { pretty: true, force: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (arg === "--compact") {
      options.pretty = false;
      continue;
    }
    if (arg === "--force") {
      options.force = true;
      continue;
    }
    if (arg === "--input" || arg === "-i") {
      options.input = argv[++index];
      continue;
    }
    if (arg === "--out" || arg === "-o") {
      options.out = argv[++index];
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.input) throw new Error(`--input is required\n\n${usage()}`);
  return options;
}

async function writeResult(options: CliOptions, result: ReturnType<typeof compileFounderBrief>): Promise<void> {
  const artifactsByKey: Record<string, unknown> = {
    "product-ir.json": result.productIR,
    "readiness.json": result.readiness,
    "compilation-receipt.json": result.receipt,
  };
  if (result.executableSpec) artifactsByKey["executable-spec.json"] = result.executableSpec;
  if (result.goalDag) artifactsByKey["goal-dag.json"] = result.goalDag;
  const diagnostics = result.readiness.findings.map(({ code, severity, path, message }) => ({ code, severity, path, message }));
  artifactsByKey["diagnostics.json"] = { verdict: result.readiness.verdict, diagnostics };
  if (options.out) {
    const out = resolve(options.out);
    await ensureOutputDirectory(out);
    for (const name of Object.values(result.receipt.artifactPaths)) {
      if (!/^[a-z0-9][a-z0-9._-]*\.json$/i.test(name) || name.includes("..")) throw new Error(`Unsafe artifact filename in receipt: ${name}`);
    }
    const directory = await verifiedOutputDirectory(out);
    for (const [key, name] of Object.entries(result.receipt.artifactPaths)) {
      const value = artifactsByKey[name];
      if (value === undefined) throw new Error(`Receipt references an artifact that was not emitted: ${key}=${name}`);
      // Values are collected before entering the anchored write phase. The
      // actual writes happen synchronously using validated basenames only.
      void value;
    }
    writeAnchoredArtifacts(directory, result.receipt.artifactPaths, artifactsByKey, options);
    process.stdout.write(serializeArtifact({ receipt: result.receipt, readiness: result.readiness }, options.pretty));
  } else {
    process.stdout.write(serializeArtifact({ ...artifactsByKey, hashes: result.hashes }, options.pretty));
  }
}

async function ensureOutputDirectory(path: string): Promise<void> {
  const requested = resolve(path);
  const parsed = parse(requested);
  let current = parsed.root;
  const components = requested.slice(parsed.root.length).split(sep).filter(Boolean);
  for (const component of components) {
    current = join(current, component);
    let state;
    try {
      state = await lstat(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      try {
        await mkdir(current, { mode: 0o700 });
      } catch (mkdirError) {
        if ((mkdirError as NodeJS.ErrnoException).code !== "EEXIST") throw mkdirError;
      }
      state = await lstat(current);
    }
    if (state.isSymbolicLink()) throw new Error(`Output path contains a symlinked component: ${basename(current)}`);
    if (!state.isDirectory()) throw new Error(`Output path component is not a directory: ${basename(current)}`);
  }
  await assertCanonicalOutputDirectory(requested);
}

async function assertCanonicalOutputDirectory(path: string): Promise<void> {
  const requested = resolve(path);
  const state = await lstat(requested);
  if (state.isSymbolicLink()) throw new Error(`Output directory may not be a symlink: ${basename(requested)}`);
  if (!state.isDirectory()) throw new Error(`Output path is not a directory: ${basename(requested)}`);
  const canonical = await realpath(requested);
  if (canonical !== requested) throw new Error(`Output path resolves through a symlink: ${basename(requested)}`);
}

async function verifiedOutputDirectory(path: string): Promise<VerifiedOutputDirectory> {
  const requestedPath = resolve(path);
  const state = await lstat(requestedPath);
  if (state.isSymbolicLink()) throw new Error(`Output directory may not be a symlink: ${basename(requestedPath)}`);
  if (!state.isDirectory()) throw new Error(`Output path is not a directory: ${basename(requestedPath)}`);
  const realPath = await realpath(requestedPath);
  if (realPath !== requestedPath) throw new Error(`Output path resolves through a symlink: ${basename(requestedPath)}`);
  return { requestedPath, realPath, dev: state.dev, ino: state.ino };
}

function sameDirectory(left: { dev: number; ino: number }, right: { dev: number; ino: number }): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function openDirectory(path: string): number | undefined {
  // Windows does not provide a portable directory-handle chdir primitive in
  // Node. POSIX platforms get an O_NOFOLLOW/O_DIRECTORY handle identity check;
  // Windows still receives all path, realpath, and regular-file checks.
  if (process.platform === "win32") return undefined;
  return openSync(path, DIRECTORY_OPEN_FLAGS);
}

function procFdPath(fd: number): string {
  return `/proc/self/fd/${fd}`;
}

function assertAnchoredOutputDirectory(directory: VerifiedOutputDirectory, directoryFd: number | undefined): void {
  const cwdState = statSync(".");
  if (!sameDirectory(cwdState, directory)) throw new Error("Output directory changed during write");
  if (directoryFd !== undefined && !sameDirectory(fstatSync(directoryFd), directory)) {
    throw new Error("Output directory handle changed during write");
  }
  if (realpathSync(".") !== directory.realPath) throw new Error("Output directory path changed during write");
  const requestedState = lstatSync(directory.requestedPath);
  if (requestedState.isSymbolicLink() || !requestedState.isDirectory() || !sameDirectory(requestedState, directory)) {
    throw new Error("Output directory changed during write");
  }
  if (realpathSync(directory.requestedPath) !== directory.realPath) throw new Error("Output directory path changed during write");
}

function assertOutputTargets(names: string[], force: boolean): void {
  for (const name of names) {
    try {
      const state = lstatSync(name);
      if (state.isSymbolicLink()) throw new Error(`Refusing to write through symlink: ${basename(name)}`);
      if (!force) throw new Error(`Output artifact already exists; pass --force to replace it: ${basename(name)}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

function writeAnchoredArtifacts(
  directory: VerifiedOutputDirectory,
  artifactPaths: Record<string, string>,
  artifactsByKey: Record<string, unknown>,
  options: CliOptions,
): void {
  const names = Object.values(artifactPaths);
  const originalCwd = process.cwd();
  const originalCwdFd = openDirectory(".");
  let directoryFd: number | undefined;
  try {
    directoryFd = openDirectory(directory.realPath);
    if (directoryFd !== undefined && !sameDirectory(fstatSync(directoryFd), directory)) {
      throw new Error("Output directory changed before write");
    }
    // Once chdir succeeds, all subsequent file operations use the directory
    // inode as their anchor. No ancestor path is resolved during the write.
    process.chdir(directory.realPath);
    assertAnchoredOutputDirectory(directory, directoryFd);
    outputAnchorTestHook?.();
    assertAnchoredOutputDirectory(directory, directoryFd);
    assertOutputTargets(names, options.force);
    for (const [key, name] of Object.entries(artifactPaths)) {
      const value = artifactsByKey[name];
      if (value === undefined) throw new Error(`Receipt references an artifact that was not emitted: ${key}=${name}`);
      writeAtomic(name, serializeArtifact(value, options.pretty), options.force);
    }
    assertAnchoredOutputDirectory(directory, directoryFd);
  } finally {
    try {
      if (originalCwdFd !== undefined && process.platform === "linux") process.chdir(procFdPath(originalCwdFd));
      else process.chdir(originalCwd);
    } finally {
      if (directoryFd !== undefined) closeSync(directoryFd);
      if (originalCwdFd !== undefined) closeSync(originalCwdFd);
    }
  }
}

function writeAtomic(name: string, content: string, force: boolean): void {
  const tempName = `.${name}.${randomUUID()}.tmp`;
  let fd: number | undefined;
  let tempExists = false;
  try {
    fd = openSync(tempName, "wx", 0o600);
    tempExists = true;
    const bytes = Buffer.from(content, "utf8");
    let offset = 0;
    while (offset < bytes.length) {
      const written = writeSync(fd, bytes, offset, bytes.length - offset);
      if (written <= 0) throw new Error("Could not write output artifact");
      offset += written;
    }
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    if (force) {
      // rename replaces the directory entry itself; it never follows a
      // symlink that a concurrent process may have installed at `name`.
      renameSync(tempName, name);
      tempExists = false;
    } else {
      try {
        // A hard link is an atomic no-clobber commit on the same directory
        // inode. A concurrent creator wins or loses the collision, never gets
        // overwritten by this write.
        linkSync(tempName, name);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          throw new Error(`Output artifact already exists; pass --force to replace it: ${basename(name)}`);
        }
        throw error;
      }
      unlinkSync(tempName);
      tempExists = false;
    }
  } finally {
    if (fd !== undefined) closeSync(fd);
    if (tempExists) {
      try {
        unlinkSync(tempName);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  let options: CliOptions | undefined;
  try {
    options = parseArgs(argv);
    const raw = await readStructuredFile(options.input!);
    const result = compileFounderBrief(raw);
    await writeResult(options, result);
    return result.readiness.verdict === "READY" ? 0 : 2;
  } catch (error) {
    const body = error instanceof ProductInputError
      ? { verdict: "NOT_READY", diagnostics: [{ code: error.code, severity: "error", path: error.path, message: error.message }] }
      : { verdict: "NOT_READY", diagnostics: [{ code: "CLI_ERROR", severity: "error", path: "/", message: safeCliError(error, options) }] };
    process.stderr.write(`${JSON.stringify(body, null, 2)}\n`);
    return 1;
  }
}

function safeCliError(error: unknown, options?: CliOptions): string {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (code === "ENOENT" && options?.input) return `Could not read input file ${basename(options.input)}`;
  if (code === "EACCES" || code === "EPERM") return "Permission denied while reading the input or writing artifacts";
  const message = error instanceof Error ? error.message : String(error);
  if (/^(Output|Refusing to write|Unsafe artifact|Receipt references)/.test(message)) return message;
  return "Compilation failed; check the input and requested output directory";
}

if (require.main === module) {
  void main().then((code) => {
    process.exitCode = code;
  });
}
