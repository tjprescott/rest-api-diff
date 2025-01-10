import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Added response to RHS
 */
export function responseAddedRule(
  data: Diff<any, any>
): RuleResult | undefined {
  if (!data.path || data.path.length !== 5) return;
  if (data.path[3] === "responses" && data.kind === "N") {
    return RuleResult.FlaggedViolation;
  }
}
