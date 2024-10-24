import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Added Enum to RHS
 */
export function xHeadersAddedRule(
  data: Diff<any, any>
): RuleResult | undefined {
  if (!data.path || data.path.length < 2) return;
  const lastPaths = data.path.slice(-2);
  if (!lastPaths.includes("headers")) return;
  if (data.kind !== "N") return;
  return RuleResult.FlaggedViolation;
}
