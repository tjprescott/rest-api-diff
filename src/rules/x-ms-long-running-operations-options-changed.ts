import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Format differs between LHS and RHS. Exempts when "final-state-via" = "location"
 * is added.
 */
export function xMsLongRunningOperationOptionsChangedRule(
  data: Diff<any, any>
): RuleResult | undefined {
  if (!data.path) return;
  const lastPath = data.path[data.path.length - 1];
  if (lastPath !== "x-ms-long-running-operation-options") return;
  if (data.kind === "N" && data.rhs["final-state-via"] === "location") {
    return RuleResult.NoViolation;
  }
  return RuleResult.FlaggedViolation;
}
