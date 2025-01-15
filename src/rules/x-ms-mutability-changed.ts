import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Flag when x-ms-mutability changed.
 */
export function xMsMutabilityChangedRule(
  data: Diff<any, any>
): RuleResult | undefined {
  if (!data.path) return;
  if (data.path.length < 2) return;
  const lastPaths = data.path.slice(-2);
  if (lastPaths.includes("x-ms-mutability")) {
    return RuleResult.FlaggedViolation;
  }
}
