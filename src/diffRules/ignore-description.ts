import { DiffEdit, DiffDeleted, DiffNew, DiffArray } from "deep-diff";
import { DiffRuleResult } from "./rules.js";

/**
 * Ignores differences in any "description" properties.
 * @param data
 * @returns
 */
export function ignoreDescriptionRule(
  data:
    | DiffEdit<any, any>
    | DiffDeleted<any>
    | DiffNew<any>
    | DiffArray<any, any>
): DiffRuleResult {
  if (data.path?.length === 0) {
    return DiffRuleResult.ContinueProcessing;
  }
  const lastPath = data.path!.slice(-1)[0];
  if (lastPath === "description") {
    return DiffRuleResult.Okay;
  }
  return DiffRuleResult.ContinueProcessing;
}
