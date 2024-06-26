import { DiffEdit, DiffDeleted, DiffNew, DiffArray } from "deep-diff";
import { DiffRuleResult } from "./rules.js";

/**
 * Ignores any OpenAPI tags set on operations. This does not ignore
 * and properties of models that might have a tags property.
 * @param data
 * @returns
 */
export function ignoreOperationTagsRule(
  data:
    | DiffEdit<any, any>
    | DiffDeleted<any>
    | DiffNew<any>
    | DiffArray<any, any>
): DiffRuleResult {
  if (data.path?.length !== 4) {
    return DiffRuleResult.ContinueProcessing;
  }
  const lastPath = data.path!.slice(-1)[0];
  const firstPath = data.path![0];
  if (lastPath === "tags" && firstPath === "paths") {
    return DiffRuleResult.Okay;
  }
  return DiffRuleResult.ContinueProcessing;
}
