import { createHash } from "node:crypto";

/**
 * Canonical JSON is deliberately small and dependency-free: object keys are
 * sorted recursively, while array order remains meaningful. Timestamp fields
 * are omitted so receipts can carry a fresh createdAt without changing the
 * identity of any compiled artifact.
 */
export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(input).sort()) {
      if (isTimestampKey(key)) continue;
      output[key] = canonicalize(input[key]);
    }
    return output;
  }
  return value;
}

function isTimestampKey(key: string): boolean {
  return key === "createdAt" || key === "created_at" || key === "updatedAt" || key === "updated_at";
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function sha256Canonical(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

export function cloneCanonical<T>(value: T): T {
  return JSON.parse(canonicalJson(value)) as T;
}
