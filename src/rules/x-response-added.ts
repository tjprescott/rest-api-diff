import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Flags added responses unless it is a default response.
 */
export function xResponseAddedRule(
  data: Diff<any, any>
): RuleResult | undefined {
  if (!data.path || data.path.length !== 5) return;
  if (data.path[3] !== "responses") return;
  if (data.path[4] === "default") {
    return RuleResult.NoViolation;
  }
  if (data.kind === "N") {
    return RuleResult.FlaggedViolation;
  }
}
