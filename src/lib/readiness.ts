import { canonicalJson } from "./canonical";
import { OracleDefinition, ProductIR, ReadinessFinding, ReadinessReport, SCHEMA_VERSION } from "./types";

function finding(code: string, path: string, message: string, severity: "error" | "warning" = "error"): ReadinessFinding {
  return { code, severity, path, message };
}

function missing(value: string | undefined, code: string, path: string, label: string, findings: ReadinessFinding[]) {
  if (!value || value.trim() === "") findings.push(finding(code, path, `${label} is required`));
}

function requiredList(values: string[], code: string, path: string, label: string, findings: ReadinessFinding[]) {
  if (values.length === 0 || values.some((value) => !value || value.trim() === "")) {
    findings.push(finding(code, path, `${label} must contain non-empty values`));
  }
}

function budgetFindings(ir: ProductIR, findings: ReadinessFinding[]) {
  const budget = ir.autonomyBudget;
  if (!ir.autonomyBudgetProvided) findings.push(finding("MISSING_AUTONOMY_BUDGET", "/autonomyBudget", "Autonomy budget object must be explicitly provided"));
  if (!Number.isInteger(budget.maxReviewCycles) || budget.maxReviewCycles < 1 || budget.maxReviewCycles > 10) findings.push(finding("UNBOUNDED_REVIEW_CYCLES", "/autonomyBudget/maxReviewCycles", "Review cycles must be an integer from 1 to 10"));
  if (!Number.isInteger(budget.maxBlockerDepth) || budget.maxBlockerDepth < 1 || budget.maxBlockerDepth > 10) findings.push(finding("UNBOUNDED_BLOCKER_DEPTH", "/autonomyBudget/maxBlockerDepth", "Blocker depth must be an integer from 1 to 10"));
  if (!Number.isInteger(budget.maxNoProgressCycles) || budget.maxNoProgressCycles < 1 || budget.maxNoProgressCycles > 10) findings.push(finding("UNBOUNDED_NO_PROGRESS_CYCLES", "/autonomyBudget/maxNoProgressCycles", "No-progress cycles must be an integer from 1 to 10"));
  if (!Number.isFinite(budget.maxGoalExpansionRatio) || budget.maxGoalExpansionRatio < 1 || budget.maxGoalExpansionRatio > 10) findings.push(finding("INVALID_GOAL_EXPANSION_RATIO", "/autonomyBudget/maxGoalExpansionRatio", "Goal expansion ratio must be finite and between 1 and 10"));
  if (!Number.isInteger(budget.maxParallelWorkers) || budget.maxParallelWorkers < 1 || budget.maxParallelWorkers > 32) findings.push(finding("INVALID_PARALLEL_WORKER_LIMIT", "/autonomyBudget/maxParallelWorkers", "Parallel workers must be an integer from 1 to 32"));
  if (!Number.isInteger(budget.wallClockLimitMinutes) || budget.wallClockLimitMinutes < 1 || budget.wallClockLimitMinutes > 1440) findings.push(finding("INVALID_WALL_CLOCK_LIMIT", "/autonomyBudget/wallClockLimitMinutes", "Wall-clock limit must be an integer from 1 to 1440 minutes"));
  if (!Number.isFinite(budget.quotaLimitPercent) || budget.quotaLimitPercent <= 0 || budget.quotaLimitPercent > 100) findings.push(finding("INVALID_QUOTA_LIMIT", "/autonomyBudget/quotaLimitPercent", "Quota limit must be greater than 0 and at most 100 percent"));
}

function duplicateIds(values: string[]): string[] {
  return values.filter((value, index) => value !== "" && values.indexOf(value) !== index);
}

function oracleMap(values: OracleDefinition[]): Map<string, OracleDefinition> {
  return new Map(values.map((oracle) => [oracle.id, oracle]));
}

function validateOracles(ir: ProductIR, findings: ReadinessFinding[]) {
  const sets = { code: oracleMap(ir.oracles.code), journey: oracleMap(ir.oracles.journey), thesis: oracleMap(ir.oracles.thesis) } as const;
  for (const kind of ["code", "journey", "thesis"] as const) {
    const values = ir.oracles[kind];
    if (values.length === 0) findings.push(finding(`MISSING_${kind.toUpperCase()}_ORACLE`, `/oracles/${kind}`, `At least one ${kind} oracle is required`));
    for (const [index, oracle] of values.entries()) {
      missing(oracle.id, "MISSING_ORACLE_ID", `/oracles/${kind}/${index}/id`, "Oracle ID", findings);
      missing(oracle.description, "MISSING_ORACLE_DESCRIPTION", `/oracles/${kind}/${index}/description`, "Oracle description", findings);
    }
    for (const duplicate of duplicateIds(values.map((oracle) => oracle.id))) findings.push(finding("DUPLICATE_ORACLE_ID", `/oracles/${kind}`, `Duplicate ${kind} oracle ID: ${duplicate}`));
  }
  return sets;
}

function normalizeConflictText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9가-힣]+/g, " ").trim().replace(/\s+/g, " ");
}

function hasCutConflict(ir: ProductIR, goalIndex: number): string | undefined {
  const goal = ir.goals[goalIndex];
  const implementationText = normalizeConflictText([goal.title, goal.localObjective, ...goal.localAcceptance, ...(goal.globalAcceptance ?? [])].join(" "));
  for (const cut of ir.product.nonGoals) {
    const terms = cut.forbiddenTerms?.map(normalizeConflictText).filter(Boolean) ?? [];
    if (terms.length > 0 && terms.every((term) => implementationText.includes(term))) return cut.id;
    // Legacy cut-list fixtures use a deterministic phrase extracted from the
    // prohibition shell; no fuzzy token overlap is used.
    const phrase = normalizeConflictText(cut.rule)
      .replace(/^(do not|don't|never|avoid)\s+/, "")
      .replace(/^(build|add|support|create|implement)\s+/, "")
      .replace(/\s+in\s+v\d+$/, "");
    if (phrase.length > 0 && implementationText.includes(phrase)) return cut.id;
  }
  return undefined;
}

function dependencyCycles(ir: ProductIR, findings: ReadinessFinding[]) {
  const goals = new Map(ir.goals.map((goal) => [goal.id, goal]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const reported = new Set<string>();
  const visit = (id: string, path: string[]) => {
    if (visiting.has(id)) {
      const cycle = [...path.slice(path.indexOf(id)), id].join(" -> ");
      if (!reported.has(cycle)) {
        reported.add(cycle);
        const index = ir.goals.findIndex((goal) => goal.id === id);
        findings.push(finding("GOAL_DEPENDENCY_CYCLE", `/goals/${index}/dependencies`, `Goal dependencies contain a cycle: ${cycle}`));
      }
      return;
    }
    if (visited.has(id)) return;
    const goal = goals.get(id);
    if (!goal) return;
    visiting.add(id);
    for (const dependency of goal.dependencies ?? []) visit(dependency, [...path, id]);
    visiting.delete(id);
    visited.add(id);
  };
  for (const goal of ir.goals) visit(goal.id, []);
}

const REQUIRED_VERTICAL_SLICE_STAGES = ["trigger", "input", "processing", "magic", "result"] as const;

function firstVerticalSlice(ir: ProductIR, findings: ReadinessFinding[]) {
  if (ir.goals.length === 0) return;
  const first = [...ir.goals].sort((left, right) =>
    (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
    || (canonicalJson(left) < canonicalJson(right) ? -1 : canonicalJson(left) > canonicalJson(right) ? 1 : 0))[0];
  const firstIndex = typeof first.sourceIndex === "number" ? first.sourceIndex : ir.goals.indexOf(first);
  const slice = first.verticalSlice;
  const declaredStages = (slice?.stages ?? []).map((stage) => stage.toLowerCase());
  const referenced = (first.journeyRefs ?? [])
    .map((id) => ir.journeys.find((journey) => journey.id === id))
    .filter((journey): journey is ProductIR["journeys"][number] => journey !== undefined);
  const referencedByStage = new Map<string, ProductIR["journeys"][number]>();
  for (const journey of referenced) {
    const stage = journey.stage.toLowerCase();
    // Duplicate stage references are ambiguous: a vertical slice must name a
    // single journey contract for every required stage.
    if (!referencedByStage.has(stage)) referencedByStage.set(stage, journey);
    else referencedByStage.set(stage, { ...journey, stage: "__duplicate__" });
  }
  const declaredIndices = REQUIRED_VERTICAL_SLICE_STAGES.map((stage) => declaredStages.indexOf(stage));
  const declaredContractIsOrdered = declaredIndices.every((index, position) =>
    index >= 0 && (position === 0 || index > declaredIndices[position - 1]));
  const actualContractIsComplete = REQUIRED_VERTICAL_SLICE_STAGES.every((stage) => {
    const journey = referencedByStage.get(stage);
    return journey !== undefined && journey.stage === stage;
  });
  const magicJourney = referencedByStage.get("magic");
  const magicIsLinked = magicJourney?.magicMomentRef === ir.product.magicMoment.id && first.charterRefs.includes(ir.product.magicMoment.id);
  const complete = slice?.deliversMagicMoment === true
    && declaredContractIsOrdered
    && actualContractIsComplete
    && magicIsLinked;
  if (!complete) findings.push(finding("INVALID_VERTICAL_SLICE", `/goals/${firstIndex}/verticalSlice`, "The first goal must link actual trigger, magic, and result Journey stages to the declared Magic Moment"));
}

export function evaluateReadiness(ir: ProductIR): ReadinessReport {
  const findings: ReadinessFinding[] = [];
  missing(ir.product.id, "MISSING_PRODUCT_ID", "/product/id", "Product ID", findings);
  missing(ir.product.title, "MISSING_PRODUCT_TITLE", "/product/title", "Product title", findings);
  missing(ir.product.targetUser, "MISSING_TARGET_USER", "/product/targetUser", "Target user", findings);
  missing(ir.product.trigger, "MISSING_TRIGGER", "/product/trigger", "Trigger", findings);
  missing(ir.product.promise, "MISSING_PRODUCT_PROMISE", "/product/promise", "Product Promise", findings);
  missing(ir.product.behaviorChange.before, "MISSING_BEHAVIOR_CHANGE", "/product/behaviorChange/before", "Before behavior", findings);
  missing(ir.product.behaviorChange.after, "MISSING_BEHAVIOR_CHANGE", "/product/behaviorChange/after", "After behavior", findings);
  missing(ir.product.magicMoment.id, "MISSING_MAGIC_MOMENT_ID", "/product/magicMoment/id", "Magic Moment ID", findings);
  missing(ir.product.magicMoment.definition, "MISSING_MAGIC_MOMENT", "/product/magicMoment/definition", "Magic Moment definition", findings);
  missing(ir.product.coreLoop.id, "MISSING_CORE_LOOP_ID", "/product/coreLoop/id", "Core Loop ID", findings);
  requiredList(ir.product.coreLoop.steps, "MISSING_CORE_LOOP", "/product/coreLoop/steps", "Core Loop steps", findings);
  if (ir.product.coreLoop.steps.length < 2) findings.push(finding("MISSING_CORE_LOOP", "/product/coreLoop/steps", "Core Loop needs at least two steps"));
  missing(ir.product.wedge.id, "MISSING_WEDGE_ID", "/product/wedge/id", "Wedge ID", findings);
  missing(ir.product.wedge.definition, "MISSING_WEDGE", "/product/wedge/definition", "Wedge definition", findings);
  if (!Number.isInteger(ir.charter.version) || ir.charter.version < 1) findings.push(finding("INVALID_CHARTER_VERSION", "/charter/version", "Charter version must be a positive integer"));
  for (const duplicate of duplicateIds(ir.charter.clauses.map((clause) => clause.id))) findings.push(finding("DUPLICATE_CHARTER_CLAUSE_ID", "/charter/clauses", `Duplicate Charter clause ID: ${duplicate}`));
  if (ir.product.nonGoals.length === 0) findings.push(finding("MISSING_NON_GOALS", "/product/nonGoals", "At least one non-goal/cut-list rule is required"));
  for (const [index, cut] of ir.product.nonGoals.entries()) {
    missing(cut.id, "MISSING_NON_GOAL_ID", `/product/nonGoals/${index}/id`, "Non-goal ID", findings);
    missing(cut.rule, "MISSING_NON_GOAL_RULE", `/product/nonGoals/${index}/rule`, "Non-goal rule", findings);
  }
  if (Object.keys(ir.authorityMatrix).length === 0) findings.push(finding("MISSING_AUTHORITY_MATRIX", "/authorityMatrix", "Decision Authority Matrix is required"));
  for (const [key, authority] of Object.entries(ir.authorityMatrix)) {
    missing(authority.owner, "MISSING_AUTHORITY_OWNER", `/authorityMatrix/${key}/owner`, "Authority owner", findings);
    if (authority.examples !== undefined && authority.examples.length === 0) {
      findings.push(finding("MISSING_AUTHORITY_EXAMPLES", `/authorityMatrix/${key}/examples`, "Authority examples must contain at least one non-empty example when supplied"));
    }
  }
  budgetFindings(ir, findings);
  const journeyIds = new Set<string>();
  if (ir.journeys.length === 0) findings.push(finding("MISSING_JOURNEY", "/journeys", "At least one Product Journey is required"));
  for (const [index, journey] of ir.journeys.entries()) {
    missing(journey.id, "MISSING_JOURNEY_ID", `/journeys/${index}/id`, "Journey ID", findings);
    missing(journey.stage, "MISSING_JOURNEY_STAGE", `/journeys/${index}/stage`, "Journey stage", findings);
    missing(journey.userAction, "MISSING_JOURNEY_ACTION", `/journeys/${index}/userAction`, "Journey user action", findings);
    missing(journey.productResponse, "MISSING_JOURNEY_RESPONSE", `/journeys/${index}/productResponse`, "Journey product response", findings);
    missing(journey.observableOracle, "MISSING_JOURNEY_OBSERVABLE_ORACLE", `/journeys/${index}/observableOracle`, "Journey observable oracle", findings);
    if (journey.id) journeyIds.add(journey.id);
  }
  for (const duplicate of duplicateIds(ir.journeys.map((journey) => journey.id))) findings.push(finding("DUPLICATE_JOURNEY_ID", "/journeys", `Duplicate journey ID: ${duplicate}`));
  const oracles = validateOracles(ir, findings);
  const charterIds = new Set(ir.charter.clauses.map((clause) => clause.id));
  const goalIds = new Set(ir.goals.map((goal) => goal.id));
  if (ir.goals.length === 0) findings.push(finding("MISSING_GOAL", "/goals", "At least one executable goal is required"));
  for (const duplicate of duplicateIds(ir.goals.map((goal) => goal.id))) findings.push(finding("DUPLICATE_GOAL_ID", "/goals", `Duplicate goal ID: ${duplicate}`));
  for (const [index, goal] of ir.goals.entries()) {
    missing(goal.id, "MISSING_GOAL_ID", `/goals/${index}/id`, "Goal ID", findings);
    missing(goal.title, "MISSING_GOAL_TITLE", `/goals/${index}/title`, "Goal title", findings);
    missing(goal.localObjective, "MISSING_LOCAL_OBJECTIVE", `/goals/${index}/localObjective`, "Local objective", findings);
    missing(goal.escalationRule, "MISSING_ESCALATION_RULE", `/goals/${index}/escalationRule`, "Escalation rule", findings);
    if (goal.charterRefs.length === 0 || goal.charterRefs.some((ref) => !ref || !charterIds.has(ref))) findings.push(finding("ORPHAN_GOAL", `/goals/${index}/charterRefs`, "Every goal must reference existing non-empty Charter clauses"));
    if ((goal.journeyRefs ?? []).some((ref) => !ref || !journeyIds.has(ref))) findings.push(finding("INVALID_JOURNEY_REFERENCE", `/goals/${index}/journeyRefs`, "Goal references an unknown Journey"));
    if (goal.localAcceptance.length === 0 || goal.localAcceptance.some((value) => !value.trim())) findings.push(finding("MISSING_LOCAL_ACCEPTANCE", `/goals/${index}/localAcceptance`, "Every goal needs non-empty local acceptance criteria"));
    requiredList(goal.forbiddenScope, "MISSING_FORBIDDEN_SCOPE", `/goals/${index}/forbiddenScope`, "Forbidden scope", findings);
    requiredList(goal.validationBoundary.code, "MISSING_VALIDATION_BOUNDARY", `/goals/${index}/validationBoundary/code`, "Code validation boundary", findings);
    requiredList(goal.validationBoundary.journey, "MISSING_VALIDATION_BOUNDARY", `/goals/${index}/validationBoundary/journey`, "Journey validation boundary", findings);
    requiredList(goal.validationBoundary.thesis, "MISSING_VALIDATION_BOUNDARY", `/goals/${index}/validationBoundary/thesis`, "Thesis validation boundary", findings);
    if ((goal.journeyRefs ?? []).length > 0 && (!goal.globalAcceptance || goal.globalAcceptance.length === 0)) findings.push(finding("MISSING_GLOBAL_ACCEPTANCE", `/goals/${index}/globalAcceptance`, "Journey goals need global acceptance criteria"));
    if ((goal.dependencies ?? []).some((dependency) => !dependency || !goalIds.has(dependency))) findings.push(finding("INVALID_GOAL_DEPENDENCY", `/goals/${index}/dependencies`, "Goal dependency does not exist"));
    if (goal.verticalSlice !== undefined) {
      requiredList(goal.verticalSlice.stages, "INVALID_VERTICAL_SLICE", `/goals/${index}/verticalSlice/stages`, "Vertical slice stages", findings);
    }
    const refs = goal.oracleRefs ?? { code: [], journey: [], thesis: [] };
    for (const kind of ["code", "journey", "thesis"] as const) {
      const values = refs[kind];
      if (values.length === 0) findings.push(finding(`MISSING_GOAL_${kind.toUpperCase()}_ORACLE`, `/goals/${index}/oracleRefs/${kind}`, `Goal needs at least one ${kind} oracle reference`));
      for (const ref of values) if (!oracles[kind].has(ref)) findings.push(finding(`INVALID_${kind.toUpperCase()}_ORACLE_REFERENCE`, `/goals/${index}/oracleRefs/${kind}`, `Unknown ${kind} oracle reference: ${ref}`));
    }
    const conflictCut = hasCutConflict(ir, index);
    if (conflictCut) findings.push(finding("CUT_LIST_CONFLICT", `/goals/${index}/localObjective`, `Goal conflicts with cut-list clause ${conflictCut}`));
  }
  dependencyCycles(ir, findings);
  firstVerticalSlice(ir, findings);
  if (!ir.productMovie) findings.push(finding("OPTIONAL_PRODUCT_MOVIE_MISSING", "/productMovie", "Product Movie is optional in v0", "warning"));
  if (!ir.controls?.rollback || !ir.controls?.pause || !ir.controls?.cancel) findings.push(finding("OPTIONAL_ROLLBACK_CONTROLS_MISSING", "/controls", "Rollback, pause, and cancel controls are warnings in v0", "warning"));
  findings.sort((left, right) => left.path.localeCompare(right.path) || left.code.localeCompare(right.code) || left.severity.localeCompare(right.severity));
  const errorCount = findings.filter((entry) => entry.severity === "error").length;
  return { schemaVersion: SCHEMA_VERSION, verdict: errorCount === 0 ? "READY" : "NOT_READY", findings, errorCount, warningCount: findings.length - errorCount };
}
