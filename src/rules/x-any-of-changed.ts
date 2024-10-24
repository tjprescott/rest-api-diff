import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Name differs between LHS and RHS.
 */
export function xAnyOfChangedRule(
  data: Diff<any, any>
): RuleResult | undefined {
  if (!data.path || data.path.length < 2) return;
  const paths = data.path.slice(-2);
  if (!paths.includes("$anyOf")) return;
  return RuleResult.FlaggedViolation;
}
