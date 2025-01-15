import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * A security schema was added.
 */
export function xSecurityAddedRule(
  data: Diff<any, any>
): RuleResult | undefined {
  if (!data.path) return;
  const lastPath = data.path[data.path.length - 1];
  if (lastPath === "security" && data.kind === "N") {
    return RuleResult.FlaggedViolation;
  }
}
