import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Format differs between LHS and RHS.
 */
export function xMsLongRunningOperationChangedRule(
  data: Diff<any, any>
): RuleResult | undefined {
  if (!data.path) return;
  const lastPath = data.path[data.path.length - 1];
  if (lastPath !== "x-ms-long-running-operation") return;
  return RuleResult.FlaggedViolation;
}
