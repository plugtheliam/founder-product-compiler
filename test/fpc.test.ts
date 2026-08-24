import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import {
  canonicalJson,
  compileFounderBrief,
  compileProductIR,
  evaluateReadiness,
  normalizeProductIntent,
  parseStructuredText,
  sha256Canonical,
  INPUT_LIMITS,
  readStructuredFile,
} from "../src";
import { main, setOutputAnchorTestHookForTests } from "../src/cli";
import { MAX_ARTIFACT_BYTES, validateArtifacts } from "../scripts/validate-artifacts";

const fixturePath = resolve("test/fixtures/social-growth-engine.json");
const negativeCasesPath = resolve("test/fixtures/negative-cases.json");

async function fixture(): Promise<Record<string, any>> {
  return JSON.parse(await readFile(fixturePath, "utf8")) as Record<string, any>;
}

async function negative(name: string): Promise<Record<string, any>> {
  const base = await fixture();
  const cases = JSON.parse(await readFile(negativeCasesPath, "utf8")) as Record<string, { operation: string; path: string; value?: unknown }>;
  const instruction = cases[name];
  const path = instruction.path.split(".");
  let cursor: any = base;
  for (const part of path.slice(0, -1)) cursor = cursor[part];
  const key = path[path.length - 1];
  if (instruction.operation === "delete") delete cursor[key];
  else cursor[key] = instruction.value;
  return base;
}

test("valid Social Growth Engine fixture compiles to all artifacts", async () => {
  const result = compileFounderBrief(await fixture(), { createdAt: "2026-08-23T00:00:00.000Z" });
  assert.equal(result.readiness.verdict, "READY");
  assert.ok(result.executableSpec);
  assert.ok(result.goalDag);
  assert.equal(result.goalDag!.goals[0].id, "G001");
  assert.equal(result.goalDag!.goals[0].verticalSlice.deliversMagicMoment, true);
  const charterIds = new Set(result.productIR.charter.clauses.map((clause) => clause.id));
  assert.ok(result.goalDag!.goals.every((goal) => goal.charterRefs.every((ref) => charterIds.has(ref))));
  assert.ok(result.goalDag!.goals.every((goal) => goal.localAcceptance.length > 0));
  assert.ok(result.goalDag!.goals.filter((goal) => goal.journeyRefs.length > 0).every((goal) => goal.globalAcceptance.length > 0));
  assert.deepEqual(result.receipt.sourceHash, result.hashes.source);
  assert.equal(result.receipt.productIRHash, sha256Canonical(result.productIR));
  assert.equal(result.receipt.executableSpecHash, sha256Canonical(result.executableSpec));
  assert.equal(result.receipt.goalDagHash, sha256Canonical(result.goalDag));
  assert.ok(result.receipt.artifactPaths.diagnostics);
  assert.equal(result.receipt.artifactPaths.executableSpec, "executable-spec.json");
});

test("READY output is a schema invariant for normalized optional fields", async () => {
  const input = await fixture();
  input.journeys.find((journey: any) => journey.id === "J01").magicMomentRef = "   ";
  input.journeys.forEach((journey: any) => { journey.stage = journey.stage.toUpperCase(); });
  input.goals[0].verticalSlice.stages = input.goals[0].verticalSlice.stages.map((stage: string) => stage.toUpperCase());
  const root = mkdtempSync(join(tmpdir(), "fpc-ready-invariant-"));
  try {
    const inputPath = join(root, "brief.json");
    const out = join(root, "out");
    await writeFile(inputPath, JSON.stringify(input));
    const cli = resolve("src/cli.ts");
    const runner = resolve("node_modules/.bin/tsx");
    const compiled = spawnSync(runner, [cli, "--input", inputPath, "--out", out], { encoding: "utf8" });
    assert.equal(compiled.status, 0, compiled.stderr);
    const productIR = JSON.parse(readFileSync(join(out, "product-ir.json"), "utf8"));
    assert.equal(Object.prototype.hasOwnProperty.call(productIR.journeys.find((journey: any) => journey.id === "J01"), "magicMomentRef"), false);
    assert.ok(productIR.journeys.every((journey: any) => journey.stage === journey.stage.toLowerCase()));
    assert.ok(productIR.goals[0].verticalSlice.stages.every((stage: string) => stage === stage.toLowerCase()));
    await validateArtifacts(out);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("canonical hashes are deterministic and exclude receipt timestamps", async () => {
  const input = await fixture();
  const first = compileFounderBrief(input, { createdAt: "2026-08-23T00:00:00.000Z" });
  const second = compileFounderBrief(input, { createdAt: "2026-08-24T00:00:00.000Z" });
  assert.deepEqual(first.hashes, second.hashes);
  assert.equal(canonicalJson({ value: 1, createdAt: "a" }), canonicalJson({ createdAt: "b", value: 1 }));
  assert.notEqual(first.receipt.createdAt, second.receipt.createdAt);
});

test("missing Product Promise fails closed with a stable diagnostic", async () => {
  const result = compileFounderBrief(await negative("missing-promise"));
  assert.equal(result.readiness.verdict, "NOT_READY");
  assert.ok(result.readiness.findings.some((entry) => entry.code === "MISSING_PRODUCT_PROMISE" && entry.path === "/product/promise"));
  assert.equal(result.executableSpec, undefined);
});

test("missing Magic Moment fails closed", async () => {
  const result = compileFounderBrief(await negative("missing-magic-moment"));
  assert.equal(result.readiness.verdict, "NOT_READY");
  assert.ok(result.readiness.findings.some((entry) => entry.code === "MISSING_MAGIC_MOMENT"));
});

test("orphan goals are rejected when Charter references do not exist", async () => {
  const result = compileFounderBrief(await negative("orphan-goal"));
  assert.ok(result.readiness.findings.some((entry) => entry.code === "ORPHAN_GOAL" && entry.path.includes("charterRefs")));
});

test("Cut List conflicts are detected from implementation intent", async () => {
  const result = compileFounderBrief(await negative("cut-list-conflict"));
  assert.ok(result.readiness.findings.some((entry) => entry.code === "CUT_LIST_CONFLICT"));
});

test("a technical-layer first goal is not a vertical slice", async () => {
  const result = compileFounderBrief(await negative("technical-layer-first-goal"));
  assert.ok(result.readiness.findings.some((entry) => entry.code === "INVALID_VERTICAL_SLICE"));
});

test("journey goals require separate global acceptance criteria", async () => {
  const result = compileFounderBrief(await negative("missing-global-acceptance"));
  assert.ok(result.readiness.findings.some((entry) => entry.code === "MISSING_GLOBAL_ACCEPTANCE"));
});

test("autonomy budgets reject unbounded review cycles", async () => {
  const result = compileFounderBrief(await negative("unbounded-budget"));
  assert.ok(result.readiness.findings.some((entry) => entry.code === "UNBOUNDED_REVIEW_CYCLES"));
});

test("missing autonomy budgets fail closed instead of receiving an implicit default", async () => {
  const result = compileFounderBrief(await negative("missing-budget"));
  assert.ok(result.readiness.findings.some((entry) => entry.code === "MISSING_AUTONOMY_BUDGET" && entry.path === "/autonomyBudget"));
});

test("partial autonomy budgets receive approved defaults while wholly missing budgets remain NOT_READY", async () => {
  const input = await fixture();
  input.autonomyBudget = { maxReviewCycles: 4 };
  const partial = compileFounderBrief(input);
  assert.equal(partial.productIR.autonomyBudget.maxReviewCycles, 4);
  assert.equal(partial.productIR.autonomyBudget.maxBlockerDepth, 2);
  assert.equal(partial.readiness.verdict, "READY");
  delete input.autonomyBudget;
  const missing = compileFounderBrief(input);
  assert.ok(missing.readiness.findings.some((entry) => entry.code === "MISSING_AUTONOMY_BUDGET"));
});

test("required IDs, titles, objectives, escalation, and leaf contracts fail with stable paths", async () => {
  const input = await fixture();
  delete input.title;
  delete input.journeys[0].id;
  delete input.goals[0].id;
  delete input.goals[0].title;
  delete input.goals[0].localObjective;
  delete input.goals[0].escalationRule;
  input.goals[0].validationBoundary.code = [];
  const result = compileFounderBrief(input);
  for (const expected of [
    ["MISSING_PRODUCT_TITLE", "/product/title"],
    ["MISSING_JOURNEY_ID", "/journeys/0/id"],
    ["MISSING_GOAL_ID", "/goals/0/id"],
    ["MISSING_GOAL_TITLE", "/goals/0/title"],
    ["MISSING_LOCAL_OBJECTIVE", "/goals/0/localObjective"],
    ["MISSING_ESCALATION_RULE", "/goals/0/escalationRule"],
    ["MISSING_VALIDATION_BOUNDARY", "/goals/0/validationBoundary/code"],
  ]) assert.ok(result.readiness.findings.some((entry) => entry.code === expected[0] && entry.path === expected[1]), `${expected[0]} missing`);
});

test("goal dependency self references and cycles are rejected", async () => {
  const self = await fixture();
  self.goals[0].dependencies = ["G001"];
  assert.ok(compileFounderBrief(self).readiness.findings.some((entry) => entry.code === "GOAL_DEPENDENCY_CYCLE"));
  const cycle = await fixture();
  cycle.goals[0].dependencies = ["G002"];
  cycle.goals[1].dependencies = ["G001"];
  assert.ok(compileFounderBrief(cycle).readiness.findings.some((entry) => entry.code === "GOAL_DEPENDENCY_CYCLE"));
});

test("vertical slice follows actual journey stages and reports the original goal index", async () => {
  const input = await fixture();
  [input.goals[0], input.goals[1]] = [input.goals[1], input.goals[0]];
  input.goals[1].verticalSlice = { stages: ["trigger", "magic", "result"], deliversMagicMoment: true };
  input.journeys.find((journey: any) => journey.id === "J02").magicMomentRef = "OTHER-MAGIC";
  const result = compileFounderBrief(input);
  assert.ok(result.readiness.findings.some((entry) => entry.code === "INVALID_VERTICAL_SLICE" && entry.path === "/goals/1/verticalSlice"));
});

test("vertical slice requires the ordered end-to-end contract and matching Journey refs", async () => {
  const missingJourney = await fixture();
  missingJourney.goals[0].journeyRefs = ["J01", "J02", "J04", "J05"];
  const missingJourneyResult = compileFounderBrief(missingJourney);
  assert.ok(missingJourneyResult.readiness.findings.some((entry) => entry.code === "INVALID_VERTICAL_SLICE"));

  const contradictoryOrder = await fixture();
  contradictoryOrder.goals[0].verticalSlice.stages = ["trigger", "processing", "input", "magic", "result"];
  const contradictoryOrderResult = compileFounderBrief(contradictoryOrder);
  assert.ok(contradictoryOrderResult.readiness.findings.some((entry) => entry.code === "INVALID_VERTICAL_SLICE"));
});

test("blank optional magicMomentRef is omitted before strict artifact emission", async () => {
  const input = await fixture();
  input.journeys.find((journey: any) => journey.id === "J01").magicMomentRef = "  ";
  const result = compileFounderBrief(input);
  assert.equal(result.readiness.verdict, "READY");
  const journey = result.productIR.journeys.find((entry) => entry.id === "J01");
  assert.ok(journey);
  assert.equal(journey!.magicMomentRef, undefined);
});

test("empty supplied authority examples fail readiness before strict schema emission", async () => {
  const input = await fixture();
  input.authorityMatrix.outwardAction.examples = [];
  const result = compileFounderBrief(input);
  assert.equal(result.readiness.verdict, "NOT_READY");
  assert.ok(result.readiness.findings.some((entry) => entry.code === "MISSING_AUTHORITY_EXAMPLES" && entry.path === "/authorityMatrix/outwardAction/examples"));
  assert.equal(result.executableSpec, undefined);

  const root = mkdtempSync(join(tmpdir(), "fpc-authority-examples-"));
  try {
    const inputPath = join(root, "brief.json");
    const out = join(root, "out");
    await writeFile(inputPath, JSON.stringify(input));
    const cli = resolve("src/cli.ts");
    const runner = resolve("node_modules/.bin/tsx");
    const failed = spawnSync(runner, [cli, "--input", inputPath, "--out", out], { encoding: "utf8" });
    assert.equal(failed.status, 2, failed.stderr);
    await validateArtifacts(out);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("every supplied vertical slice has non-empty stages while first goal keeps end-to-end validation", async () => {
  const empty = await fixture();
  empty.goals[1].verticalSlice = { stages: [], deliversMagicMoment: false };
  const emptyResult = compileFounderBrief(empty);
  assert.equal(emptyResult.readiness.verdict, "NOT_READY");
  assert.ok(emptyResult.readiness.findings.some((entry) => entry.code === "INVALID_VERTICAL_SLICE" && entry.path === "/goals/1/verticalSlice/stages"));

  const technical = await fixture();
  technical.goals[1].verticalSlice = { stages: ["database"], deliversMagicMoment: false };
  const technicalResult = compileFounderBrief(technical);
  assert.equal(technicalResult.readiness.verdict, "READY");
  assert.deepEqual(technicalResult.executableSpec!.goals.find((goal) => goal.id === "G002")!.verticalSlice, {
    stages: ["database"],
    deliversMagicMoment: false,
  });
});

test("journey and vertical-slice stage names are canonicalized to lowercase", async () => {
  const input = await fixture();
  input.journeys.forEach((journey: any) => { journey.stage = journey.stage.toUpperCase(); });
  input.goals[0].verticalSlice.stages = ["TRIGGER", "INPUT", "PROCESSING", "MAGIC", "RESULT"];
  const result = compileFounderBrief(input);
  assert.equal(result.readiness.verdict, "READY");
  assert.ok(result.productIR.journeys.every((journey) => journey.stage === journey.stage.toLowerCase()));
  assert.deepEqual(Object.fromEntries(result.productIR.journeys.map((journey) => [journey.id, journey.stage])), {
    J01: "trigger",
    J02: "magic",
    J03: "loop",
    J04: "result",
    J05: "input",
    J06: "processing",
  });
  assert.deepEqual(result.productIR.goals.find((goal) => goal.id === "G001")!.verticalSlice!.stages, ["trigger", "input", "processing", "magic", "result"]);
  assert.deepEqual(result.goalDag!.goals.find((goal) => goal.id === "G001")!.verticalSlice.stages, ["trigger", "input", "processing", "magic", "result"]);
});

test("each goal has referenced Code, Journey, and Thesis oracles", async () => {
  const input = await fixture();
  input.goals[0].oracleRefs = { code: ["UNKNOWN"], journey: [], thesis: [] };
  const result = compileFounderBrief(input);
  assert.ok(result.readiness.findings.some((entry) => entry.code === "INVALID_CODE_ORACLE_REFERENCE"));
  assert.ok(result.readiness.findings.some((entry) => entry.code === "MISSING_GOAL_JOURNEY_ORACLE"));
  assert.ok(result.readiness.findings.some((entry) => entry.code === "MISSING_GOAL_THESIS_ORACLE"));
  const missing = await fixture();
  delete missing.goals[1].oracleRefs;
  assert.ok(compileFounderBrief(missing).readiness.findings.some((entry) => entry.code === "MISSING_GOAL_CODE_ORACLE" && entry.path === "/goals/1/oracleRefs/code"));
});

test("structured cut terms avoid unsafe token-overlap conflicts", async () => {
  const input = await fixture();
  input.goals[0].localObjective = "Improve team permissions documentation without building an organization permission system";
  const result = compileFounderBrief(input);
  assert.equal(result.readiness.findings.some((entry) => entry.code === "CUT_LIST_CONFLICT"), false);
});

test("identity collections normalize deterministically while core-loop semantics remain ordered", async () => {
  const input = await fixture();
  const first = compileFounderBrief(input);
  input.nonGoals.reverse();
  input.journeys.reverse();
  input.oracles.code.reverse();
  input.oracles.journey.reverse();
  input.oracles.thesis.reverse();
  input.authorityMatrix.outwardAction.examples.reverse();
  input.goals.reverse();
  for (const goal of input.goals) {
    goal.charterRefs.reverse();
    goal.journeyRefs.reverse();
    goal.localAcceptance.reverse();
    goal.globalAcceptance.reverse();
    goal.forbiddenScope.reverse();
    goal.dependencies.reverse();
    goal.validationBoundary.code.reverse();
    goal.validationBoundary.journey.reverse();
    goal.validationBoundary.thesis.reverse();
    goal.oracleRefs.code.reverse();
    goal.oracleRefs.journey.reverse();
    goal.oracleRefs.thesis.reverse();
  }
  const second = compileFounderBrief(input);
  assert.deepEqual(first.hashes, second.hashes);
  assert.equal(JSON.stringify(first.productIR), JSON.stringify(second.productIR));
  assert.equal(JSON.stringify(first.executableSpec), JSON.stringify(second.executableSpec));
  assert.equal(JSON.stringify(first.goalDag), JSON.stringify(second.goalDag));
  assert.deepEqual(first.productIR.product.coreLoop.steps, ["observe", "draft", "approve", "schedule", "learn"]);
});

test("structured JSON and YAML input share the same boundary", () => {
  const parsed = parseStructuredText("id: demo\ntargetUser: founder\n");
  assert.deepEqual(parsed, { id: "demo", targetUser: "founder" });
  assert.deepEqual(parseStructuredText(JSON.stringify({ note: "*base" })), { note: "*base" });
});

test("structured input limits reject oversized, deep, broad, long-string, and alias-bomb inputs", () => {
  assert.throws(
    () => parseStructuredText("x".repeat(INPUT_LIMITS.maxBytes + 1)),
    (error: any) => error.code === "INPUT_LIMIT_EXCEEDED" && /byte limit/.test(error.message),
  );
  const deep = "[".repeat(INPUT_LIMITS.maxDepth + 1) + "0" + "]".repeat(INPUT_LIMITS.maxDepth + 1);
  assert.throws(
    () => parseStructuredText(deep),
    (error: any) => error.code === "INPUT_LIMIT_EXCEEDED" && /nesting depth/.test(error.message),
  );
  const broad = JSON.stringify(Array.from({ length: INPUT_LIMITS.maxNodes + 1 }, () => "node"));
  assert.throws(
    () => parseStructuredText(broad),
    (error: any) => error.code === "INPUT_LIMIT_EXCEEDED" && /node limit/.test(error.message),
  );
  const longString = JSON.stringify({ value: "x".repeat(INPUT_LIMITS.maxStringLength + 1) });
  assert.throws(
    () => parseStructuredText(longString),
    (error: any) => error.code === "INPUT_LIMIT_EXCEEDED" && /string limit/.test(error.message),
  );
  const aliases = ["base: &base value", ...Array.from({ length: INPUT_LIMITS.maxYamlAliases + 1 }, (_, index) => `item${index}: *base`)].join("\n");
  assert.throws(
    () => parseStructuredText(aliases),
    (error: any) => error.code === "INPUT_LIMIT_EXCEEDED" && /alias limit/.test(error.message),
  );
});

test("file input rejects sparse oversized files and symlinks before parsing", async () => {
  const root = mkdtempSync(join(tmpdir(), "fpc-input-files-"));
  try {
    const oversized = join(root, "oversized.json");
    writeFileSync(oversized, "");
    truncateSync(oversized, INPUT_LIMITS.maxBytes + 1);
    await assert.rejects(
      () => readStructuredFile(oversized),
      (error: any) => error.code === "INPUT_LIMIT_EXCEEDED" && /byte limit/.test(error.message),
    );

    const realInput = join(root, "real-input.json");
    const linkedInput = join(root, "linked-input.json");
    await writeFile(realInput, JSON.stringify({ id: "not-read-through-a-link" }));
    symlinkSync(realInput, linkedInput);
    await assert.rejects(() => readStructuredFile(linkedInput), /symlink/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI writes machine-readable artifacts and exits nonzero for NOT_READY", async () => {
  const out = mkdtempSync(join(tmpdir(), "fpc-test-"));
  try {
    const cli = resolve("src/cli.ts");
    const runner = resolve("node_modules/.bin/tsx");
    const valid = spawnSync(runner, [cli, "--input", fixturePath, "--out", out], { encoding: "utf8" });
    assert.equal(valid.status, 0, valid.stderr);
    const receipt = JSON.parse(readFileSync(join(out, "compilation-receipt.json"), "utf8"));
    const diagnostics = JSON.parse(readFileSync(join(out, "diagnostics.json"), "utf8"));
    assert.equal(receipt.readinessVerdict, "READY");
    assert.equal(diagnostics.verdict, "READY");
    await validateArtifacts(out);

    const collision = spawnSync(runner, [cli, "--input", fixturePath, "--out", out], { encoding: "utf8" });
    assert.equal(collision.status, 1);
    const forced = spawnSync(runner, [cli, "--input", fixturePath, "--out", out, "--force"], { encoding: "utf8" });
    assert.equal(forced.status, 0, forced.stderr);

    const invalidPath = join(out, "invalid.json");
    const invalid = await negative("missing-promise");
    await import("node:fs/promises").then(({ writeFile }) => writeFile(invalidPath, JSON.stringify(invalid)));
    const failed = spawnSync(runner, [cli, "--input", invalidPath, "--out", join(out, "invalid-out")], { encoding: "utf8" });
    assert.equal(failed.status, 2, failed.stderr);
    const invalidDiagnostics = JSON.parse(readFileSync(join(out, "invalid-out", "diagnostics.json"), "utf8"));
    const invalidReceipt = JSON.parse(readFileSync(join(out, "invalid-out", "compilation-receipt.json"), "utf8"));
    assert.equal(invalidDiagnostics.verdict, "NOT_READY");
    assert.equal(invalidReceipt.artifactPaths.executableSpec, undefined);
    assert.equal(invalidReceipt.artifactPaths.diagnostics, "diagnostics.json");
    await validateArtifacts(join(out, "invalid-out"));
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test("every documented NOT_READY CLI bundle validates against the partial Product IR contract", async () => {
  const cases = JSON.parse(await readFile(negativeCasesPath, "utf8")) as Record<string, unknown>;
  const root = mkdtempSync(join(tmpdir(), "fpc-not-ready-schema-"));
  try {
    const cli = resolve("src/cli.ts");
    const runner = resolve("node_modules/.bin/tsx");
    for (const name of Object.keys(cases)) {
      const inputPath = join(root, `${name}.json`);
      const outputPath = join(root, name);
      await writeFile(inputPath, JSON.stringify(await negative(name)));
      const failed = spawnSync(runner, [cli, "--input", inputPath, "--out", outputPath], { encoding: "utf8" });
      assert.equal(failed.status, 2, `${name}: ${failed.stderr}`);
      await validateArtifacts(outputPath);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("nested executable and Goal DAG schemas reject underfilled goals", async () => {
  const out = mkdtempSync(join(tmpdir(), "fpc-schema-negative-"));
  try {
    const cli = resolve("src/cli.ts");
    const runner = resolve("node_modules/.bin/tsx");
    const compiled = spawnSync(runner, [cli, "--input", fixturePath, "--out", out], { encoding: "utf8" });
    assert.equal(compiled.status, 0, compiled.stderr);

    const executable = JSON.parse(readFileSync(join(out, "executable-spec.json"), "utf8"));
    executable.goals = [{}];
    await writeFile(join(out, "executable-spec.json"), JSON.stringify(executable));
    await assert.rejects(() => validateArtifacts(out), /executable-spec\.json failed schema validation/);

    const restored = spawnSync(runner, [cli, "--input", fixturePath, "--out", out, "--force"], { encoding: "utf8" });
    assert.equal(restored.status, 0, restored.stderr);
    const dag = JSON.parse(readFileSync(join(out, "goal-dag.json"), "utf8"));
    dag.goals = [{}];
    await writeFile(join(out, "goal-dag.json"), JSON.stringify(dag));
    await assert.rejects(() => validateArtifacts(out), /goal-dag\.json failed schema validation/);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test("CLI refuses symlinked artifact targets even with --force", async () => {
  const out = mkdtempSync(join(tmpdir(), "fpc-symlink-"));
  const target = join(out, "target.json");
  const artifact = join(out, "product-ir.json");
  try {
    await import("node:fs/promises").then(({ writeFile, symlink }) => Promise.all([writeFile(target, "sentinel"), symlink(target, artifact)]));
    const cli = resolve("src/cli.ts");
    const runner = resolve("node_modules/.bin/tsx");
    const failed = spawnSync(runner, [cli, "--input", fixturePath, "--out", out, "--force"], { encoding: "utf8" });
    assert.equal(failed.status, 1);
    assert.equal(readFileSync(target, "utf8"), "sentinel");
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test("CLI refuses an output path with a symlinked ancestor", async () => {
  const root = mkdtempSync(join(tmpdir(), "fpc-symlink-ancestor-"));
  const realParent = join(root, "real-parent");
  const linkedParent = join(root, "linked-parent");
  const output = join(linkedParent, "nested", "out");
  try {
    await import("node:fs/promises").then(async ({ mkdir, symlink }) => {
      await mkdir(realParent);
      await symlink(realParent, linkedParent);
    });
    const cli = resolve("src/cli.ts");
    const runner = resolve("node_modules/.bin/tsx");
    const failed = spawnSync(runner, [cli, "--input", fixturePath, "--out", output], { encoding: "utf8" });
    assert.equal(failed.status, 1);
    assert.match(failed.stderr, /symlink/i);
    await assert.rejects(() => import("node:fs/promises").then(({ lstat }) => lstat(join(realParent, "nested"))));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("artifact validator rejects receipt traversal and symlinked artifacts", async () => {
  const root = mkdtempSync(join(tmpdir(), "fpc-validator-paths-"));
  try {
    const cli = resolve("src/cli.ts");
    const runner = resolve("node_modules/.bin/tsx");
    assert.equal(spawnSync(runner, [cli, "--input", fixturePath, "--out", root], { encoding: "utf8" }).status, 0);
    const receiptPath = join(root, "compilation-receipt.json");
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    receipt.artifactPaths.productIR = "../outside.json";
    await writeFile(receiptPath, JSON.stringify(receipt));
    await assert.rejects(() => validateArtifacts(root), /Unsafe artifact path|basename|containment/);

    const restored = spawnSync(runner, [cli, "--input", fixturePath, "--out", root, "--force"], { encoding: "utf8" });
    assert.equal(restored.status, 0, restored.stderr);
    const outside = join(root, "outside.json");
    const artifact = join(root, "product-ir.json");
    await import("node:fs/promises").then(async ({ unlink, symlink, writeFile: write }) => {
      await write(outside, "sentinel");
      await unlink(artifact);
      await symlink(outside, artifact);
    });
    await assert.rejects(() => validateArtifacts(root), /symlink/i);
    assert.equal(readFileSync(outside, "utf8"), "sentinel");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("artifact validator rejects oversized regular files before JSON parsing", async () => {
  const root = mkdtempSync(join(tmpdir(), "fpc-validator-size-"));
  try {
    const cli = resolve("src/cli.ts");
    const runner = resolve("node_modules/.bin/tsx");
    assert.equal(spawnSync(runner, [cli, "--input", fixturePath, "--out", root], { encoding: "utf8" }).status, 0);
    truncateSync(join(root, "product-ir.json"), MAX_ARTIFACT_BYTES + 1);
    await assert.rejects(() => validateArtifacts(root), /maximum byte limit/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("anchored output rejects an ancestor replacement after directory verification", async () => {
  const root = mkdtempSync(join(tmpdir(), "fpc-output-anchor-"));
  const originalParent = join(root, "original-parent");
  const movedParent = join(root, "moved-parent");
  const replacementParent = join(root, "replacement-parent");
  const output = join(originalParent, "out");
  try {
    mkdirSync(output, { recursive: true });
    mkdirSync(join(replacementParent, "out"), { recursive: true });
    setOutputAnchorTestHookForTests(() => {
      renameSync(originalParent, movedParent);
      renameSync(replacementParent, originalParent);
    });
    const code = await main(["--input", fixturePath, "--out", output]);
    assert.equal(code, 1);
    assert.equal(readdirSync(join(movedParent, "out")).length, 0);
    assert.equal(readdirSync(join(originalParent, "out")).length, 0);
  } finally {
    setOutputAnchorTestHookForTests(undefined);
    rmSync(root, { recursive: true, force: true });
  }
});

test("round-trip Product IR retains source binding and schema shape", async () => {
  const brief = normalizeProductIntent(await fixture());
  const ir = compileProductIR(brief);
  const roundTrip = JSON.parse(JSON.stringify(ir));
  assert.equal(roundTrip.schemaVersion, "fpc.v0");
  assert.equal(roundTrip.sourceHash, sha256Canonical(brief));
  assert.equal(roundTrip.charter.sha256, ir.charter.sha256);
  assert.ok(roundTrip.goals.every((goal: any) => goal.charterRefs.length > 0));
  assert.equal(evaluateReadiness(ir).verdict, "READY");
});
