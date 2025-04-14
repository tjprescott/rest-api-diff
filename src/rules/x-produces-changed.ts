import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Produces changed.
 */
export function xProducesChangedRule(
  data: Diff<any, any>
): RuleResult | undefined {
  if (!data.path) return;
  const lastPath = data.path[data.path.length - 1];
  if (lastPath !== "produces") return;
  return RuleResult.FlaggedViolation;
}
