export const SCHEMA_VERSION = "fpc.v0";
export const COMPILER_VERSION = "0.1.0";

export type ReadinessVerdict = "READY" | "NOT_READY";
export type FindingSeverity = "error" | "warning";

export interface BehaviorChange {
  before: string;
  after: string;
}

export interface MagicMoment {
  id: string;
  definition: string;
}

export interface CoreLoop {
  id: string;
  steps: string[];
}

export interface Wedge {
  id: string;
  definition: string;
}

export interface NonGoal {
  id: string;
  rule: string;
  forbiddenTerms?: string[];
}

export interface DecisionAuthority {
  owner: string;
  constraint?: string;
  escalationWhen?: string;
  examples?: string[];
}

export type DecisionAuthorityMatrix = Record<string, DecisionAuthority>;

export interface AutonomyBudget {
  maxReviewCycles: number;
  maxBlockerDepth: number;
  maxNoProgressCycles: number;
  maxGoalExpansionRatio: number;
  maxParallelWorkers: number;
  wallClockLimitMinutes: number;
  quotaLimitPercent: number;
}

export const DEFAULT_AUTONOMY_BUDGET: AutonomyBudget = {
  maxReviewCycles: 3,
  maxBlockerDepth: 2,
  maxNoProgressCycles: 2,
  maxGoalExpansionRatio: 1.5,
  maxParallelWorkers: 4,
  wallClockLimitMinutes: 180,
  quotaLimitPercent: 20,
};

export type JourneyStage = "trigger" | "input" | "processing" | "magic" | "result" | "loop";

export interface ProductJourney {
  id: string;
  stage: JourneyStage | string;
  userAction: string;
  productResponse: string;
  observableOracle: string;
  magicMomentRef?: string;
}

export interface OracleDefinition {
  id: string;
  description: string;
}

export interface OracleSet {
  code: OracleDefinition[];
  journey: OracleDefinition[];
  thesis: OracleDefinition[];
}

export interface OracleRefs {
  code: string[];
  journey: string[];
  thesis: string[];
}

export interface ProductMovie {
  trigger?: string;
  magic?: string;
  repeat?: string;
  monetization?: string;
  sharing?: string;
}

export interface RollbackControls {
  rollback?: string;
  pause?: string;
  cancel?: string;
}

export interface FounderGoalInput {
  id: string;
  title: string;
  charterRefs: string[];
  journeyRefs?: string[];
  localObjective: string;
  localAcceptance: string[];
  globalAcceptance?: string[];
  forbiddenScope: string[];
  escalationRule: string;
  dependencies?: string[];
  oracleRefs?: OracleRefs;
  validationBoundary: {
    code: string[];
    journey: string[];
    thesis: string[];
  };
  verticalSlice?: {
    stages: string[];
    deliversMagicMoment: boolean;
  };
  /** Non-enumerable input position retained only for stable diagnostics. */
  sourceIndex?: number;
}

export interface FounderBrief {
  id: string;
  title?: string;
  targetUser: string;
  trigger: string;
  promise: string;
  behaviorChange: BehaviorChange;
  magicMoment: MagicMoment;
  coreLoop: CoreLoop;
  wedge: Wedge;
  nonGoals: NonGoal[];
  authorityMatrix: DecisionAuthorityMatrix;
  autonomyBudget?: Partial<AutonomyBudget>;
  autonomyBudgetProvided: boolean;
  journeys: ProductJourney[];
  oracles: OracleSet;
  goals: FounderGoalInput[];
  productMovie?: ProductMovie;
  controls?: RollbackControls;
  charterVersion?: number;
}

export interface CharterClause {
  id: string;
  kind: "user" | "trigger" | "promise" | "behavior" | "magic" | "loop" | "wedge" | "non-goal" | "journey";
  statement: string;
}

export interface ProductCharter {
  id: string;
  version: number;
  clauses: CharterClause[];
  sha256: string;
}

export interface ProductIR {
  schemaVersion: string;
  compilerVersion: string;
  product: {
    id: string;
    title: string;
    targetUser: string;
    trigger: string;
    promise: string;
    behaviorChange: BehaviorChange;
    magicMoment: MagicMoment;
    coreLoop: CoreLoop;
    wedge: Wedge;
    nonGoals: NonGoal[];
  };
  charter: ProductCharter;
  journeys: ProductJourney[];
  authorityMatrix: DecisionAuthorityMatrix;
  autonomyBudget: AutonomyBudget;
  autonomyBudgetProvided: boolean;
  oracles: OracleSet;
  goals: FounderGoalInput[];
  productMovie?: ProductMovie;
  controls?: RollbackControls;
  sourceHash: string;
}

export interface ExecutableSpec {
  schemaVersion: string;
  compilerVersion: string;
  productId: string;
  productIRHash: string;
  promise: string;
  magicMoment: MagicMoment;
  coreLoop: CoreLoop;
  wedge: Wedge;
  journeys: ProductJourney[];
  goals: FounderGoalInput[];
  authorityMatrix: DecisionAuthorityMatrix;
  autonomyBudget: AutonomyBudget;
  oracles: OracleSet;
  forbiddenScope: string[];
}

export interface CompiledGoal extends FounderGoalInput {
  charterRefs: string[];
  journeyRefs: string[];
  dependencies: string[];
  globalAcceptance: string[];
  verticalSlice: {
    stages: string[];
    deliversMagicMoment: boolean;
  };
  oracleRefs: OracleRefs;
}

export interface GoalDag {
  schemaVersion: string;
  compilerVersion: string;
  productId: string;
  productIRHash: string;
  roots: string[];
  goals: CompiledGoal[];
}

export interface ReadinessFinding {
  code: string;
  severity: FindingSeverity;
  path: string;
  message: string;
}

export interface ReadinessReport {
  schemaVersion: string;
  verdict: ReadinessVerdict;
  findings: ReadinessFinding[];
  errorCount: number;
  warningCount: number;
}

export interface CompilationReceipt {
  schemaVersion: string;
  compilerVersion: string;
  sourceHash: string;
  productIRHash: string;
  executableSpecHash?: string;
  goalDagHash?: string;
  readinessVerdict: ReadinessVerdict;
  artifactPaths: Record<string, string>;
  createdAt: string;
}

export interface CompilationResult {
  brief: FounderBrief;
  productIR: ProductIR;
  readiness: ReadinessReport;
  executableSpec?: ExecutableSpec;
  goalDag?: GoalDag;
  receipt: CompilationReceipt;
  hashes: {
    source: string;
    productIR: string;
    executableSpec?: string;
    goalDag?: string;
  };
}
