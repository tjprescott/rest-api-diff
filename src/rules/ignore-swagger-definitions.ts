import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

const specificPathsToIgnore = [
  "definitions",
  "parameters",
  "responses",
  "securityDefinitions",
];

export function ignoreSwaggerDefinitionsRule(
  data: Diff<any, any>
): RuleResult | undefined {
  if (!data.path) return;
  const fullPath = data.path.join(".");
  for (const pathToIgnore of specificPathsToIgnore) {
    if (data.path[0] === pathToIgnore) {
      return RuleResult.NoViolation;
    }
  }
}
