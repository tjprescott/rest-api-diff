import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Format differs between LHS and RHS.
 */
export function xMsMutabilityAddedRule(
  data: Diff<any, any>
): RuleResult | [RuleResult, string] {
  if (!data.path) return RuleResult.ContinueProcessing;
  const lastPath = data.path[data.path.length - 1];
  if (lastPath !== "x-ms-mutability") return RuleResult.ContinueProcessing;
  if (data.kind === "N") {
    const message = `x-ms-mutability added to RHS.`;
    return [RuleResult.FlaggedViolation, message];
  }
  return RuleResult.ContinueProcessing;
}
