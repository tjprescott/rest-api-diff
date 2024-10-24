import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * x-ms-secret changed.
 */
export function xMsSecretChangedRule(
  data: Diff<any, any>
): RuleResult | undefined {
  if (!data.path) return;
  const lastPath = data.path[data.path.length - 1];
  if (lastPath !== "x-ms-secret") return;
  return RuleResult.FlaggedViolation;
}
