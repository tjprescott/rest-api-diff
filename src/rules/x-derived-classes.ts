import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Name differs between LHS and RHS.
 */
export function xDerivedClassesRule(
  data: Diff<any, any>
): RuleResult | [RuleResult, string] {
  if (!data.path || data.path.length < 2) return RuleResult.ContinueProcessing;
  const paths = data.path.slice(-2);
  if (!paths.includes("$derivedClasses")) return RuleResult.ContinueProcessing;
  const message = `Derived classes differ between LHS and RHS.`;
  return [RuleResult.FlaggedViolation, message];
}
