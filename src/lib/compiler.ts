import { canonicalJson, cloneCanonical, sha256Canonical } from "./canonical";
import { parseFounderBrief } from "./schema";
import {
  COMPILER_VERSION,
  CompilationReceipt,
  CompilationResult,
  CompiledGoal,
  DEFAULT_AUTONOMY_BUDGET,
  ExecutableSpec,
  FounderBrief,
  FounderGoalInput,
  GoalDag,
  ProductCharter,
  ProductIR,
  ReadinessReport,
  SCHEMA_VERSION,
} from "./types";
import { evaluateReadiness } from "./readiness";

export interface CompileOptions {
  compilerVersion?: string;
  createdAt?: string;
  artifactPaths?: Record<string, string>;
}

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortValues(values: string[]): string[] {
  return [...values].sort(compareStable);
}

function sortByIdentity<T extends { id: string }>(values: T[]): T[] {
  return [...values].sort((left, right) =>
    compareStable(left.id, right.id) || compareStable(canonicalJson(left), canonicalJson(right)));
}

function normalizeGoal(goal: FounderGoalInput): FounderGoalInput {
  const normalized: FounderGoalInput = {
    ...goal,
    charterRefs: sortValues(goal.charterRefs),
    journeyRefs: sortValues(goal.journeyRefs ?? []),
    localAcceptance: sortValues(goal.localAcceptance),
    globalAcceptance: sortValues(goal.globalAcceptance ?? []),
    forbiddenScope: sortValues(goal.forbiddenScope),
    dependencies: sortValues(goal.dependencies ?? []),
    validationBoundary: {
      code: sortValues(goal.validationBoundary.code),
      journey: sortValues(goal.validationBoundary.journey),
      thesis: sortValues(goal.validationBoundary.thesis),
    },
    ...(goal.oracleRefs === undefined
      ? {}
      : {
          oracleRefs: {
            code: sortValues(goal.oracleRefs.code),
            journey: sortValues(goal.oracleRefs.journey),
            thesis: sortValues(goal.oracleRefs.thesis),
          },
        }),
    ...(goal.verticalSlice === undefined
      ? {}
      : {
          // The stage order is a semantic end-to-end contract and must not be
          // sorted like the identity/reference collections above.
          verticalSlice: {
            stages: [...goal.verticalSlice.stages],
            deliversMagicMoment: goal.verticalSlice.deliversMagicMoment,
          },
        }),
  };
  if (typeof goal.sourceIndex === "number") {
    Object.defineProperty(normalized, "sourceIndex", { value: goal.sourceIndex, enumerable: false, writable: false });
  }
  return normalized;
}

function normalizeNonGoal(nonGoal: FounderBrief["nonGoals"][number]): FounderBrief["nonGoals"][number] {
  return {
    ...nonGoal,
    ...(nonGoal.forbiddenTerms === undefined ? {} : { forbiddenTerms: sortValues(nonGoal.forbiddenTerms) }),
  };
}

export function normalizeProductIntent(input: unknown): FounderBrief {
  const parsed = parseFounderBrief(input);
  const cloned = cloneCanonical(parsed);
  cloned.goals.forEach((goal, index) => {
    Object.defineProperty(goal, "sourceIndex", { value: index, enumerable: false, writable: false });
  });
  const budget = { ...DEFAULT_AUTONOMY_BUDGET, ...(cloned.autonomyBudget ?? {}) };
  return {
    ...cloned,
    autonomyBudget: budget,
    nonGoals: sortByIdentity(cloned.nonGoals.map(normalizeNonGoal)),
    journeys: sortByIdentity(cloned.journeys),
    oracles: {
      code: sortByIdentity(cloned.oracles.code),
      journey: sortByIdentity(cloned.oracles.journey),
      thesis: sortByIdentity(cloned.oracles.thesis),
    },
    // Goals are an identity collection. Their reference/value lists are also
    // normalized before sourceHash is calculated; core-loop and vertical-slice
    // stage sequences remain untouched because their order carries meaning.
    goals: sortByIdentity(cloned.goals.map(normalizeGoal)),
  };
}

export function compileProductIR(brief: FounderBrief, compilerVersion = COMPILER_VERSION): ProductIR {
  const sourceHash = sha256Canonical(brief);
  const autonomyBudget = { ...DEFAULT_AUTONOMY_BUDGET, ...(brief.autonomyBudget ?? {}) };
  const clauses = [
    { id: "CHARTER-TARGET-USER", kind: "user" as const, statement: `Target user: ${brief.targetUser}` },
    { id: "CHARTER-TRIGGER", kind: "trigger" as const, statement: `Trigger: ${brief.trigger}` },
    { id: "CHARTER-PROMISE", kind: "promise" as const, statement: `Promise: ${brief.promise}` },
    { id: "CHARTER-BEHAVIOR-BEFORE", kind: "behavior" as const, statement: `Before: ${brief.behaviorChange.before}` },
    { id: "CHARTER-BEHAVIOR-AFTER", kind: "behavior" as const, statement: `After: ${brief.behaviorChange.after}` },
    { id: brief.magicMoment.id, kind: "magic" as const, statement: brief.magicMoment.definition },
    { id: brief.coreLoop.id, kind: "loop" as const, statement: brief.coreLoop.steps.join(" → ") },
    { id: brief.wedge.id, kind: "wedge" as const, statement: brief.wedge.definition },
    ...brief.nonGoals.map((entry) => ({ id: entry.id, kind: "non-goal" as const, statement: entry.rule })),
    ...brief.journeys.map((entry) => ({ id: entry.id, kind: "journey" as const, statement: entry.observableOracle })),
  ].sort((left, right) =>
    compareStable(left.id, right.id) || compareStable(canonicalJson(left), canonicalJson(right)));
  const charterBasis = { id: brief.id, version: brief.charterVersion ?? 1, clauses };
  const charter: ProductCharter = { ...charterBasis, sha256: sha256Canonical(charterBasis) };

  return {
    schemaVersion: SCHEMA_VERSION,
    compilerVersion,
    product: {
      id: brief.id,
      title: brief.title ?? "",
      targetUser: brief.targetUser,
      trigger: brief.trigger,
      promise: brief.promise,
      behaviorChange: brief.behaviorChange,
      magicMoment: brief.magicMoment,
      coreLoop: brief.coreLoop,
      wedge: brief.wedge,
      nonGoals: brief.nonGoals,
    },
    charter,
    journeys: brief.journeys,
    authorityMatrix: brief.authorityMatrix,
    autonomyBudget,
    autonomyBudgetProvided: brief.autonomyBudgetProvided,
    oracles: brief.oracles,
    goals: brief.goals,
    ...(brief.productMovie === undefined ? {} : { productMovie: brief.productMovie }),
    ...(brief.controls === undefined ? {} : { controls: brief.controls }),
    sourceHash,
  };
}

export function compileExecutableSpec(ir: ProductIR, compilerVersion = ir.compilerVersion): ExecutableSpec {
  const goals = sortByIdentity(ir.goals.map(normalizeGoal));
  const forbiddenScope = [...ir.goals]
    .flatMap((goal) => goal.forbiddenScope)
    .filter((value, index, values) => values.indexOf(value) === index)
    .sort(compareStable);
  return {
    schemaVersion: SCHEMA_VERSION,
    compilerVersion,
    productId: ir.product.id,
    productIRHash: sha256Canonical(ir),
    promise: ir.product.promise,
    magicMoment: ir.product.magicMoment,
    coreLoop: ir.product.coreLoop,
    wedge: ir.product.wedge,
    journeys: sortByIdentity(ir.journeys),
    goals,
    authorityMatrix: ir.authorityMatrix,
    autonomyBudget: ir.autonomyBudget,
    oracles: ir.oracles,
    forbiddenScope,
  };
}

export function compileGoalDag(ir: ProductIR, compilerVersion = ir.compilerVersion): GoalDag {
  const goals: CompiledGoal[] = sortByIdentity(ir.goals.map(normalizeGoal)).map((goal: FounderGoalInput) => ({
    ...goal,
    journeyRefs: [...(goal.journeyRefs ?? [])],
    dependencies: [...(goal.dependencies ?? [])],
    globalAcceptance: [...(goal.globalAcceptance ?? [])],
    verticalSlice: goal.verticalSlice ?? { stages: [], deliversMagicMoment: false },
    oracleRefs: {
      code: [...(goal.oracleRefs?.code ?? [])],
      journey: [...(goal.oracleRefs?.journey ?? [])],
      thesis: [...(goal.oracleRefs?.thesis ?? [])],
    },
  }));
  const roots = goals.filter((goal) => goal.dependencies.length === 0).map((goal) => goal.id);
  return {
    schemaVersion: SCHEMA_VERSION,
    compilerVersion,
    productId: ir.product.id,
    productIRHash: sha256Canonical(ir),
    roots,
    goals,
  };
}

export function emitCompilationReceipt(
  result: Omit<CompilationResult, "receipt">,
  options: CompileOptions = {},
): CompilationReceipt {
  return {
    schemaVersion: SCHEMA_VERSION,
    compilerVersion: options.compilerVersion ?? result.productIR.compilerVersion,
    sourceHash: result.hashes.source,
    productIRHash: result.hashes.productIR,
    ...(result.hashes.executableSpec === undefined ? {} : { executableSpecHash: result.hashes.executableSpec }),
    ...(result.hashes.goalDag === undefined ? {} : { goalDagHash: result.hashes.goalDag }),
    readinessVerdict: result.readiness.verdict,
    artifactPaths: options.artifactPaths ?? {
      productIR: "product-ir.json",
      readiness: "readiness.json",
      ...(result.executableSpec === undefined ? {} : { executableSpec: "executable-spec.json" }),
      ...(result.goalDag === undefined ? {} : { goalDag: "goal-dag.json" }),
      receipt: "compilation-receipt.json",
      diagnostics: "diagnostics.json",
    },
    createdAt: options.createdAt ?? new Date().toISOString(),
  };
}

export function compileFounderBrief(input: unknown, options: CompileOptions = {}): CompilationResult {
  const brief = normalizeProductIntent(input);
  const compilerVersion = options.compilerVersion ?? COMPILER_VERSION;
  const productIR = compileProductIR(brief, compilerVersion);
  const readiness = evaluateReadiness(productIR);
  const productIRHash = sha256Canonical(productIR);
  const hashes: CompilationResult["hashes"] = { source: productIR.sourceHash, productIR: productIRHash };
  let executableSpec: ExecutableSpec | undefined;
  let goalDag: GoalDag | undefined;
  if (readiness.verdict === "READY") {
    executableSpec = compileExecutableSpec(productIR, compilerVersion);
    goalDag = compileGoalDag(productIR, compilerVersion);
    hashes.executableSpec = sha256Canonical(executableSpec);
    hashes.goalDag = sha256Canonical(goalDag);
  }
  const partial = { brief, productIR, readiness, executableSpec, goalDag, hashes };
  return { ...partial, receipt: emitCompilationReceipt(partial, options) };
}
