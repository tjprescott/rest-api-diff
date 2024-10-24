import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Path added to RHS that isn't in LHS.
 */
export function xPathAddedRule(data: Diff<any, any>): RuleResult | undefined {
  if (!data.path || data.path.length !== 2) return;
  if (data.kind === "N") {
    return RuleResult.FlaggedViolation;
  }
}
