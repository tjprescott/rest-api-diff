import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Path added to RHS that isn't in LHS.
 */
export function xPathAddedRule(
  data: Diff<any, any>
): RuleResult | [RuleResult, string] {
  if (!data.path || data.path.length !== 2)
    return RuleResult.ContinueProcessing;
  const path = data.path[1];
  if (data.kind === "N") {
    const message = `Path exists in RHS that isn't in LHS: ${path}`;
    return [RuleResult.FlaggedViolation, message];
  }
  return RuleResult.ContinueProcessing;
}
