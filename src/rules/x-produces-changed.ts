import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Produces changed.
 */
export function xProducesChangedRule(
  data: Diff<any, any>
): RuleResult | [RuleResult, string] {
  if (!data.path) return RuleResult.ContinueProcessing;
  const lastPath = data.path[data.path.length - 1];
  if (lastPath !== "produces") return RuleResult.ContinueProcessing;
  return RuleResult.FlaggedViolation;
}
