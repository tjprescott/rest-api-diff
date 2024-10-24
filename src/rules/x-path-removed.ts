import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Path removed from LHS.
 */
export function xPathRemovedRule(
  data: Diff<any, any>
): RuleResult | [RuleResult, string] {
  if (!data.path || data.path.length !== 2)
    return RuleResult.ContinueProcessing;
  const path = data.path[1];
  if (data.kind === "D") {
    const message = `Path exists in LHS that isn't in RHS: ${path}`;
    return [RuleResult.FlaggedViolation, message];
  }
  return RuleResult.ContinueProcessing;
}
