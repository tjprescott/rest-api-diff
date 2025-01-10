import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Removed response from RHS
 */
export function responseRemovedRule(
  data: Diff<any, any>
): RuleResult | undefined {
  if (!data.path || data.path.length !== 5) return;
  if (data.path[3] === "responses" && data.kind === "D") {
    return RuleResult.FlaggedViolation;
  }
}
