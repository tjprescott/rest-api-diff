import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Format differs between LHS and RHS.
 */
export function xMsLongRunningOperationOptionsChangedRule(
  data: Diff<any, any>
): RuleResult | [RuleResult, string] {
  if (!data.path) return RuleResult.ContinueProcessing;
  const lastPath = data.path[data.path.length - 1];
  if (lastPath !== "x-ms-long-running-operation-options")
    return RuleResult.ContinueProcessing;
  return RuleResult.FlaggedViolation;
}
