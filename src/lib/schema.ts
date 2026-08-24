import {
  AutonomyBudget,
  BehaviorChange,
  DecisionAuthorityMatrix,
  FounderBrief,
  FounderGoalInput,
  MagicMoment,
  NonGoal,
  OracleDefinition,
  OracleRefs,
  OracleSet,
  ProductJourney,
  Wedge,
} from "./types";
import { createHash } from "node:crypto";

export class ProductInputError extends Error {
  readonly code: string;
  readonly path: string;

  constructor(message: string, path = "/", code = "INVALID_INPUT") {
    super(message);
    this.name = "ProductInputError";
    this.path = path;
    this.code = code;
  }
}

/** Conservative limits for untrusted structured briefs. */
export const INPUT_LIMITS = Object.freeze({
  maxBytes: 1024 * 1024,
  maxDepth: 64,
  maxNodes: 10_000,
  maxCollections: 2_000,
  maxStringLength: 100_000,
  maxTotalStringBytes: 1_000_000,
  maxYamlAliases: 100,
});

function inputLimit(message: string, path = "/"): ProductInputError {
  return new ProductInputError(message, path, "INPUT_LIMIT_EXCEEDED");
}

/** Enforce bounded object shape before schema-specific parsing. */
export function assertStructuredValueLimits(value: unknown): void {
  const pending: Array<{ value: unknown; path: string; depth: number }> = [{ value, path: "/", depth: 0 }];
  const seen = new WeakSet<object>();
  let nodes = 0;
  let collections = 0;
  let totalStringBytes = 0;
  while (pending.length > 0) {
    const entry = pending.pop()!;
    if (entry.depth > INPUT_LIMITS.maxDepth) throw inputLimit("Input exceeds the maximum nesting depth", entry.path);
    nodes += 1;
    if (nodes > INPUT_LIMITS.maxNodes) throw inputLimit("Input exceeds the maximum node limit", entry.path);
    if (typeof entry.value === "string") {
      if (entry.value.length > INPUT_LIMITS.maxStringLength) throw inputLimit("Input exceeds the maximum string limit", entry.path);
      totalStringBytes += Buffer.byteLength(entry.value, "utf8");
      if (totalStringBytes > INPUT_LIMITS.maxTotalStringBytes) throw inputLimit("Input exceeds the maximum string-byte limit", entry.path);
      continue;
    }
    if (!entry.value || typeof entry.value !== "object") continue;
    if (seen.has(entry.value)) continue;
    seen.add(entry.value);
    collections += 1;
    if (collections > INPUT_LIMITS.maxCollections) throw inputLimit("Input exceeds the maximum collection limit", entry.path);
    if (Array.isArray(entry.value)) {
      for (let index = entry.value.length - 1; index >= 0; index -= 1) {
        pending.push({ value: entry.value[index], path: `${entry.path}${index}/`, depth: entry.depth + 1 });
      }
      continue;
    }
    for (const [key, child] of Object.entries(entry.value)) {
      if (key.length > INPUT_LIMITS.maxStringLength) throw inputLimit("Input exceeds the maximum string limit", `${entry.path}${key}`);
      totalStringBytes += Buffer.byteLength(key, "utf8");
      if (totalStringBytes > INPUT_LIMITS.maxTotalStringBytes) throw inputLimit("Input exceeds the maximum string-byte limit", `${entry.path}${key}`);
      pending.push({ value: child, path: `${entry.path}${key}/`, depth: entry.depth + 1 });
    }
  }
}

function record(value: unknown, path: string, required = true): Record<string, unknown> {
  if (value === undefined || value === null) {
    if (!required) return {};
    throw new ProductInputError("Expected an object", path);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProductInputError("Expected an object", path);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, path: string, required = true): string {
  if (typeof value !== "string" || (required && value.trim() === "")) {
    if (!required && (value === undefined || value === null)) return "";
    throw new ProductInputError("Expected a non-empty string", path);
  }
  return value.trim();
}

function list(value: unknown, path: string, required = false): unknown[] {
  if (value === undefined || value === null) {
    if (!required) return [];
    throw new ProductInputError("Expected an array", path);
  }
  if (!Array.isArray(value)) throw new ProductInputError("Expected an array", path);
  return value;
}

function textList(value: unknown, path: string): string[] {
  return list(value, path).map((entry, index) => text(entry, `${path}/${index}`));
}

function behavior(value: unknown, path: string): BehaviorChange {
  const object = record(value, path, false);
  return { before: text(object.before, `${path}/before`, false), after: text(object.after, `${path}/after`, false) };
}

function magic(value: unknown, path: string): MagicMoment {
  const object = record(value, path, false);
  return { id: text(object.id, `${path}/id`, false), definition: text(object.definition, `${path}/definition`, false) };
}

function coreLoop(value: unknown, path: string) {
  const object = record(value, path, false);
  const steps = textList(object.steps, `${path}/steps`);
  return { id: text(object.id, `${path}/id`, false), steps };
}

function wedge(value: unknown, path: string): Wedge {
  const object = record(value, path, false);
  return { id: text(object.id, `${path}/id`, false), definition: text(object.definition, `${path}/definition`, false) };
}

function nonGoals(value: unknown, path: string): NonGoal[] {
  const entries = list(value, path);
  return entries.map((entry, index) => {
    const object = record(entry, `${path}/${index}`);
    return {
      id: text(object.id, `${path}/${index}/id`, false),
      rule: text(object.rule, `${path}/${index}/rule`, false),
      ...(object.forbiddenTerms === undefined
        ? {}
        : { forbiddenTerms: textList(object.forbiddenTerms, `${path}/${index}/forbiddenTerms`) }),
    };
  });
}

function authorityMatrix(value: unknown, path: string): DecisionAuthorityMatrix {
  const object = record(value, path, false);
  const result: DecisionAuthorityMatrix = {};
  for (const [key, raw] of Object.entries(object)) {
    const item = record(raw, `${path}/${key}`);
    const owner = text(item.owner, `${path}/${key}/owner`, false);
    result[key] = {
      owner,
      ...(item.constraint === undefined ? {} : { constraint: text(item.constraint, `${path}/${key}/constraint`) }),
      ...(item.escalationWhen === undefined
        ? {}
        : { escalationWhen: text(item.escalationWhen, `${path}/${key}/escalationWhen`) }),
            ...(item.examples === undefined
              ? {}
              : { examples: textList(item.examples, `${path}/${key}/examples`).sort((left, right) => left < right ? -1 : left > right ? 1 : 0) }),
    };
  }
  return result;
}

function finiteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ProductInputError("Expected a finite number", path);
  }
  return value;
}

function finiteInteger(value: unknown, path: string): number {
  const number = finiteNumber(value, path);
  if (!Number.isInteger(number)) throw new ProductInputError("Expected a finite integer", path);
  return number;
}

function budget(value: unknown, path: string): Partial<AutonomyBudget> | undefined {
  if (value === undefined || value === null) return undefined;
  const object = record(value, path);
  const result: Partial<AutonomyBudget> = {};
  const keys = [
    "maxReviewCycles",
    "maxBlockerDepth",
    "maxNoProgressCycles",
    "maxGoalExpansionRatio",
    "maxParallelWorkers",
    "wallClockLimitMinutes",
    "quotaLimitPercent",
  ] as const;
  for (const key of keys) if (object[key] !== undefined) result[key] = finiteNumber(object[key], `${path}/${key}`);
  return result;
}

function journeys(value: unknown, path: string): ProductJourney[] {
  return list(value, path).map((entry, index) => {
    const object = record(entry, `${path}/${index}`);
    const stage = text(object.stage, `${path}/${index}/stage`, false).toLowerCase();
    const magicMomentRef = object.magicMomentRef === undefined
      ? ""
      : text(object.magicMomentRef, `${path}/${index}/magicMomentRef`, false);
    return {
      id: text(object.id, `${path}/${index}/id`, false),
      stage,
      userAction: text(object.userAction, `${path}/${index}/userAction`, false),
      productResponse: text(object.productResponse, `${path}/${index}/productResponse`, false),
      observableOracle: text(object.observableOracle, `${path}/${index}/observableOracle`, false),
      // An explicitly blank optional reference has the same meaning as an
      // omitted reference. Do not emit an empty property: strict artifact
      // schemas treat a present magicMomentRef as a non-empty value.
      ...(magicMomentRef === "" ? {} : { magicMomentRef }),
    };
  });
}

function oracleDefinition(value: unknown, path: string, kind: string, index: number): OracleDefinition {
  if (typeof value === "string") {
    const description = text(value, path);
    const stableId = createHash("sha256").update(description).digest("hex").slice(0, 12).toUpperCase();
    return { id: `${kind.toUpperCase()}-${stableId}`, description };
  }
  const object = record(value, path);
  return { id: text(object.id, `${path}/id`, false), description: text(object.description ?? object.statement, `${path}/description`, false) };
}

function oracleList(value: unknown, path: string, kind: string): OracleDefinition[] {
  return list(value, path).map((entry, index) => oracleDefinition(entry, `${path}/${index}`, kind, index));
}

function oracles(value: unknown, path: string): OracleSet {
  const object = record(value, path, false);
  return {
    code: oracleList(object.code, `${path}/code`, "code"),
    journey: oracleList(object.journey, `${path}/journey`, "journey"),
    thesis: oracleList(object.thesis, `${path}/thesis`, "thesis"),
  };
}

function oracleRefs(value: unknown, path: string): OracleRefs | undefined {
  if (value === undefined || value === null) return undefined;
  const object = record(value, path);
  return {
    code: textList(object.code, `${path}/code`),
    journey: textList(object.journey, `${path}/journey`),
    thesis: textList(object.thesis, `${path}/thesis`),
  };
}

function goals(value: unknown, path: string): FounderGoalInput[] {
  return list(value, path).map((entry, index) => {
    const object = record(entry, `${path}/${index}`);
    const boundary = record(object.validationBoundary, `${path}/${index}/validationBoundary`, false);
    const vertical = object.verticalSlice === undefined ? undefined : record(object.verticalSlice, `${path}/${index}/verticalSlice`, false);
    return {
      id: text(object.id, `${path}/${index}/id`, false),
      title: text(object.title, `${path}/${index}/title`, false),
      charterRefs: textList(object.charterRefs, `${path}/${index}/charterRefs`),
      journeyRefs: object.journeyRefs === undefined ? [] : textList(object.journeyRefs, `${path}/${index}/journeyRefs`),
      localObjective: text(object.localObjective, `${path}/${index}/localObjective`, false),
      localAcceptance: textList(object.localAcceptance, `${path}/${index}/localAcceptance`),
      globalAcceptance:
        object.globalAcceptance === undefined ? [] : textList(object.globalAcceptance, `${path}/${index}/globalAcceptance`),
      forbiddenScope: textList(object.forbiddenScope, `${path}/${index}/forbiddenScope`),
      escalationRule: text(object.escalationRule, `${path}/${index}/escalationRule`, false),
      dependencies: object.dependencies === undefined ? [] : textList(object.dependencies, `${path}/${index}/dependencies`),
      ...(object.oracleRefs === undefined ? {} : { oracleRefs: oracleRefs(object.oracleRefs, `${path}/${index}/oracleRefs`) }),
      validationBoundary: {
        code: textList(boundary.code, `${path}/${index}/validationBoundary/code`),
        journey: textList(boundary.journey, `${path}/${index}/validationBoundary/journey`),
        thesis: textList(boundary.thesis, `${path}/${index}/validationBoundary/thesis`),
      },
      ...(vertical === undefined
        ? {}
        : {
            verticalSlice: {
              // Stage names are semantic identifiers, not display labels.
              // Canonicalize their case at the input boundary so readiness,
              // hashes, and every emitted artifact agree.
              stages: textList(vertical.stages, `${path}/${index}/verticalSlice/stages`).map((stage) => stage.toLowerCase()),
              deliversMagicMoment: vertical.deliversMagicMoment === true,
            },
          }),
    };
  });
}

/** Validate and normalize the structured founder brief at the boundary. */
export function parseFounderBrief(value: unknown): FounderBrief {
  assertStructuredValueLimits(value);
  const object = record(value, "/");
  const productMovie = object.productMovie === undefined ? undefined : record(object.productMovie, "/productMovie");
  const controls = object.controls === undefined ? undefined : record(object.controls, "/controls");
  return {
    id: text(object.id, "/id", false),
    title: object.title === undefined ? undefined : text(object.title, "/title"),
    targetUser: text(object.targetUser, "/targetUser", false),
    trigger: text(object.trigger, "/trigger", false),
    promise: text(object.promise, "/promise", false),
    behaviorChange: behavior(object.behaviorChange, "/behaviorChange"),
    magicMoment: magic(object.magicMoment, "/magicMoment"),
    coreLoop: coreLoop(object.coreLoop, "/coreLoop"),
    wedge: wedge(object.wedge, "/wedge"),
    nonGoals: nonGoals(object.nonGoals, "/nonGoals"),
    authorityMatrix: authorityMatrix(object.authorityMatrix, "/authorityMatrix"),
    autonomyBudget: budget(object.autonomyBudget, "/autonomyBudget"),
    autonomyBudgetProvided: object.autonomyBudget !== undefined && object.autonomyBudget !== null,
    journeys: journeys(object.journeys, "/journeys"),
    oracles: oracles(object.oracles, "/oracles"),
    goals: goals(object.goals, "/goals"),
    ...(productMovie === undefined
      ? {}
      : {
          productMovie: {
            ...(productMovie.trigger === undefined ? {} : { trigger: text(productMovie.trigger, "/productMovie/trigger") }),
            ...(productMovie.magic === undefined ? {} : { magic: text(productMovie.magic, "/productMovie/magic") }),
            ...(productMovie.repeat === undefined ? {} : { repeat: text(productMovie.repeat, "/productMovie/repeat") }),
            ...(productMovie.monetization === undefined
              ? {}
              : { monetization: text(productMovie.monetization, "/productMovie/monetization") }),
            ...(productMovie.sharing === undefined ? {} : { sharing: text(productMovie.sharing, "/productMovie/sharing") }),
          },
        }),
    ...(controls === undefined
      ? {}
      : {
          controls: {
            ...(controls.rollback === undefined ? {} : { rollback: text(controls.rollback, "/controls/rollback") }),
            ...(controls.pause === undefined ? {} : { pause: text(controls.pause, "/controls/pause") }),
            ...(controls.cancel === undefined ? {} : { cancel: text(controls.cancel, "/controls/cancel") }),
          },
        }),
    ...(object.charterVersion === undefined ? {} : { charterVersion: finiteInteger(object.charterVersion, "/charterVersion") }),
  };
}
