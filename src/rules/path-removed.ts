import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Path in LHS that isn't in RHS.
 */
export function pathRemovedRule(data: Diff<any, any>): RuleResult | undefined {
  if (!data.path || data.path.length !== 2) return;
  if (data.path[0] === "paths" || data.kind === "D") {
    return RuleResult.FlaggedViolation;
  }
}
