import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

const specificPathsToIgnore = [
  "definitions",
  "parameters",
  "responses",
  "securityDefinitions",
];

export function ignoreSwaggerDefintionsRule(data: Diff<any, any>): RuleResult {
  if (!data.path) return RuleResult.ContinueProcessing;
  const fullPath = data.path.join(".");
  for (const pathToIgnore of specificPathsToIgnore) {
    if (fullPath.startsWith(pathToIgnore)) {
      return RuleResult.NoViolation;
    }
  }
  return RuleResult.ContinueProcessing;
}
