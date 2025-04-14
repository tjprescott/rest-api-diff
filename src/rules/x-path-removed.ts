import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Path removed from LHS.
 */
export function xPathRemovedRule(data: Diff<any, any>): RuleResult | undefined {
  if (!data.path || data.path.length !== 2) return;
  if (data.path[0] !== "paths" || data.kind !== "D") return;
  return RuleResult.FlaggedViolation;
}
