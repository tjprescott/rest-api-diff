import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Flag when x-ms-identifiers is changed.
 */
export function xMsIdentifiersChangedRule(
  data: Diff<any, any>
): RuleResult | undefined {
  if (!data.path) return;
  const lastPath = data.path[data.path.length - 1];
  if (lastPath === "x-ms-identifiers") {
    return RuleResult.FlaggedViolation;
  }
}
