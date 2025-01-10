import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Path in RHS that isn't in LHS.
 */
export function pathAddedRule(data: Diff<any, any>): RuleResult | undefined {
  if (!data.path || data.path.length !== 2) return;
  if (data.path[0] === "paths" || data.kind === "N") {
    return RuleResult.FlaggedViolation;
  }
}
