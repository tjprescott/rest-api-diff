import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * x-ms-azure-resource ignored if it was deleted. Otherwise,
 * it is assumed to be a violation.
 */
export function xMsAzureResourceChangedRule(
  data: Diff<any, any>
): RuleResult | undefined {
  if (!data.path) return;
  const lastPath = data.path[data.path.length - 1];
  if (lastPath !== "x-ms-azure-resource") return;
  if (data.kind === "D") {
    return RuleResult.NoViolation;
  }
}
