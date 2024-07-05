import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Ensure that MORE properties are not required in the request. FEWER is okay.
 */
export function compareRequestRequiredRule(
  data: Diff<any, any>
): RuleResult | [RuleResult, string] {
  if (!data.path) return RuleResult.ContinueProcessing;
  const path = data.path.join(".");
  if (!path.endsWith("required")) return RuleResult.ContinueProcessing;
  if (!path.includes("parameters")) return RuleResult.ContinueProcessing;
  if (data.kind === "D") {
    return RuleResult.NoViolation;
  }
  if (data.kind === "N") {
    const message = `Reqest parameter '${path}' is not required in the LHS but is in the RHS.`;
    return [RuleResult.FlaggedViolation, message];
  }
  return RuleResult.ContinueProcessing;
}
