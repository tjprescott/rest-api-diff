import { DiffEdit, DiffDeleted, DiffNew, DiffArray } from "deep-diff";
import { RuleResult } from "./rules.js";

const pathsToIgnore = [
  "info.title",
  "info.description",
  "info.termsOfService",
  "info.contact",
];

export function ignoredProperties(
  data:
    | DiffEdit<any, any>
    | DiffDeleted<any>
    | DiffNew<any>
    | DiffArray<any, any>
): RuleResult {
  if (data.kind === "E") {
    const path = data.path?.join(".");
    if (!path) {
      return RuleResult.ContinueProcessing;
    }
    for (const pti of pathsToIgnore) {
      if (path.startsWith(pti)) {
        return RuleResult.Okay;
      }
    }
  }
  return RuleResult.ContinueProcessing;
}
