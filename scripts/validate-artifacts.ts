import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { readRegularFileBounded } from "../src/lib/io";

const schemaByArtifact: Record<string, string> = {
  productIR: "product-ir.schema.json",
  readiness: "readiness.schema.json",
  executableSpec: "executable-spec.schema.json",
  goalDag: "goal-dag.schema.json",
  receipt: "compilation-receipt.schema.json",
  diagnostics: "diagnostics.schema.json",
};

const artifactFilenameByKey: Record<string, string> = {
  productIR: "product-ir.json",
  readiness: "readiness.json",
  executableSpec: "executable-spec.json",
  goalDag: "goal-dag.json",
  receipt: "compilation-receipt.json",
  diagnostics: "diagnostics.json",
};

/** Keep schema and generated-artifact reads bounded even when a receipt is hostile. */
export const MAX_ARTIFACT_BYTES = 4 * 1024 * 1024;

async function assertSafeDirectory(directory: string): Promise<string> {
  const out = resolve(directory);
  const state = await lstat(out);
  if (state.isSymbolicLink() || !state.isDirectory()) throw new Error("Artifact directory must be a real directory");
  if ((await realpath(out)) !== out) throw new Error("Artifact directory resolves through a symlink");
  return out;
}

async function safeArtifactPath(out: string, key: string, filename: unknown): Promise<string> {
  const expected = artifactFilenameByKey[key];
  if (!expected || typeof filename !== "string" || filename !== expected || filename.includes("/") || filename.includes("\\") || isAbsolute(filename) || filename.includes("..")) {
    throw new Error(`Unsafe artifact path for ${key}; expected a known basename`);
  }
  const target = resolve(out, filename);
  const containment = relative(out, target);
  if (containment.startsWith(`..${sep}`) || containment === ".." || isAbsolute(containment)) {
    throw new Error(`Unsafe artifact path for ${key}; path escapes the artifact directory`);
  }
  const state = await lstat(target);
  if (state.isSymbolicLink()) throw new Error(`Unsafe artifact path for ${key}; symlinks are not allowed`);
  if (!state.isFile()) throw new Error(`Unsafe artifact path for ${key}; artifact must be a regular file`);
  return target;
}

export async function validateArtifacts(directory: string): Promise<void> {
  const out = await assertSafeDirectory(directory);
  const schemaDir = resolve("schemas");
  const receiptPath = await safeArtifactPath(out, "receipt", "compilation-receipt.json");
  const receipt = JSON.parse(await readRegularFileBounded(receiptPath, MAX_ARTIFACT_BYTES, { label: "Compilation receipt" })) as {
    readinessVerdict: "READY" | "NOT_READY";
    artifactPaths: Record<string, string>;
  };
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  for (const [key, filename] of Object.entries(receipt.artifactPaths)) {
    const schemaFilename = key === "productIR" && receipt.readinessVerdict === "NOT_READY"
      ? "product-ir.partial.schema.json"
      : schemaByArtifact[key];
    if (!Object.hasOwn(schemaByArtifact, key) || !schemaFilename) throw new Error("Receipt contains an unknown artifact key");
    const schema = JSON.parse(await readRegularFileBounded(join(schemaDir, schemaFilename), MAX_ARTIFACT_BYTES, { label: "Artifact schema" }));
    const validate = ajv.compile(schema);
    const artifactPath = await safeArtifactPath(out, key, filename);
    const artifact = JSON.parse(await readRegularFileBounded(artifactPath, MAX_ARTIFACT_BYTES, { label: "Artifact" }));
    if (!validate(artifact)) throw new Error(`${filename} failed schema validation: ${JSON.stringify(validate.errors)}`);
  }
}

if (require.main === module) {
  const directory = process.argv[2];
  if (!directory) {
    process.stderr.write("Usage: tsx scripts/validate-artifacts.ts <artifact-directory>\n");
    process.exitCode = 1;
  } else {
    void validateArtifacts(directory).catch((error) => {
      process.stderr.write(`${safeValidationError(error)}\n`);
      process.exitCode = 1;
    });
  }
}

function safeValidationError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/^(Artifact directory must be a real directory|Artifact directory resolves through a symlink|Unsafe artifact path for [A-Za-z][A-Za-z0-9]*; (?:expected a known basename|path escapes the artifact directory|symlinks are not allowed|artifact must be a regular file))$/.test(message)) {
    return message;
  }
  return "Artifact validation failed";
}
