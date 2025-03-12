import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * x-ms-odata was removed. This is fine because no one is using it.
 * https://github.com/tjprescott/rest-api-diff/issues/61
 */
export function xMsOdataRemovedRule(
  data: Diff<any, any>
): RuleResult | undefined {
  if (!data.path) return;
  const lastPath = data.path[data.path.length - 1];
  if (lastPath !== "x-ms-odata") return;
  if (data.kind !== "D") return;
  return RuleResult.NoViolation;
}
