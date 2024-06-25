import { DiffEdit, DiffDeleted, DiffNew, DiffArray } from "deep-diff";
import { RuleResult } from "./rules.js";

const pathsToIgnore = [
  "info.title",
  "info.description",
  "info.termsOfService",
  "info.contact",
  "info.x-typespec-generated",
  "tags",
  "definitions",
  "parameters",
  "externalDocs",
  "responses",
];

/**
 * Ignores properties that describe metadata only and are not
 * relevant to the shape of the service.
 * @param data
 * @returns
 */
export function ignoredPropertiesRule(
  data:
    | DiffEdit<any, any>
    | DiffDeleted<any>
    | DiffNew<any>
    | DiffArray<any, any>
): RuleResult {
  if (data.kind === "E" || data.kind === "N" || data.kind === "D") {
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
