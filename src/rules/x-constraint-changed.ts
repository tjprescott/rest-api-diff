import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Constraints changed between the LHS and RHS.
 */
export function xConstraintChangedRule(
  data: Diff<any, any>
): RuleResult | [RuleResult, string] {
  if (!data.path) return RuleResult.ContinueProcessing;
  const lastPath = data.path[data.path.length - 1];
  const constraints = [
    "minLength",
    "maxLength",
    "pattern",
    "minimum",
    "maximum",
    "minItems",
    "maxItems",
  ];
  if (!constraints.includes(lastPath)) return RuleResult.ContinueProcessing;
  return RuleResult.FlaggedViolation;
}
