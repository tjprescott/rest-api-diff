import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Path removed from LHS.
 */
export function xPathRemovedRule(data: Diff<any, any>): RuleResult | undefined {
  if (!data.path || data.path.length !== 2) return;
  if (data.kind === "D") {
    return RuleResult.FlaggedViolation;
  }
}
