import { sha256Canonical } from "./canonical";
import { ProductIR, ReadinessReport } from "./types";

export type ProductJudgeVerdict = "CLEAR" | "REPAIR_LOCAL" | "RECOMPILE" | "REOPEN_PRODUCT";

export interface ProductJudgeReport {
  verdict: ProductJudgeVerdict;
  reasons: string[];
  productIRHash: string;
}

/** A small v0 Product Judge extension point for post-compile coherence checks. */
export function judgeProductIR(ir: ProductIR, readiness: ReadinessReport): ProductJudgeReport {
  if (readiness.verdict === "NOT_READY") {
    const productErrors = readiness.findings.filter((finding) => finding.severity === "error");
    const productLevel = productErrors.some((finding) =>
      ["MISSING_TARGET_USER", "MISSING_PRODUCT_PROMISE", "MISSING_MAGIC_MOMENT", "MISSING_WEDGE", "CUT_LIST_CONFLICT"].includes(finding.code),
    );
    return {
      verdict: productLevel ? "REOPEN_PRODUCT" : "RECOMPILE",
      reasons: productErrors.map((finding) => `${finding.code}: ${finding.path}`),
      productIRHash: sha256Canonical(ir),
    };
  }
  return { verdict: "CLEAR", reasons: [], productIRHash: sha256Canonical(ir) };
}
