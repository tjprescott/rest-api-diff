import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Added Enum to RHS
 */
export function xResponseRemovedRule(
  data: Diff<any, any>
): RuleResult | undefined {
  if (!data.path || data.path.length !== 5) return;
  if (data.path[3] !== "responses") return;
  if (data.kind === "D") {
    return RuleResult.FlaggedViolation;
  }
}
