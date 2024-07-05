import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Ensure that FEWER properties are not required in the response. MORE is okay.
 */
export function compareResponseRequiredRule(
  data: Diff<any, any>
): RuleResult | [RuleResult, string] {
  if (!data.path) return RuleResult.ContinueProcessing;
  const path = data.path.join(".");
  if (!path.endsWith("required")) return RuleResult.ContinueProcessing;
  if (!path.includes("responses")) return RuleResult.ContinueProcessing;
  if (data.kind === "N") {
    return RuleResult.NoViolation;
  }
  if (data.kind === "D") {
    const message = `Response property '${path}' is required in the LHS but not the RHS.`;
    return [RuleResult.FlaggedViolation, message];
  }
  return RuleResult.ContinueProcessing;
}
