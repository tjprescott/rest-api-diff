import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * x-ms-mutability was added to the RHS.
 */
export function xMsMutabilityAddedRule(
  data: Diff<any, any>
): RuleResult | undefined {
  if (!data.path) return;
  const lastPath = data.path[data.path.length - 1];
  if (lastPath !== "x-ms-mutability") return;
  if (data.kind !== "N") return;
  return RuleResult.FlaggedViolation;
}
