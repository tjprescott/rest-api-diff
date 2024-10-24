import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Added Enum to RHS
 */
export function xResponseAddedRule(
  data: Diff<any, any>
): RuleResult | [RuleResult, string] {
  if (!data.path || data.path.length < 5) return RuleResult.ContinueProcessing;
  if (data.path[3] !== "responses") return RuleResult.ContinueProcessing;
  const statusCode = data.path[4];
  if (data.kind === "N") {
    const message = `Response code ${statusCode} was added to RHS but is not on LHS.`;
    return [RuleResult.FlaggedViolation, message];
  }
  return RuleResult.ContinueProcessing;
}
