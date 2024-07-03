import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

const propertValuesToIgnore: Map<string, any> = new Map([
  ["x-nullable", false],
  ["readOnly", true],
]);

/**
 * Ignores a response property when the value is the default and therefore irrelevant.
 */
export function ignoreIrrelevantResponsePropertiesRule(
  data: Diff<any, any>
): RuleResult {
  if (!data.path) return RuleResult.ContinueProcessing;
  const path = data.path;
  if (path.length < 4) return RuleResult.ContinueProcessing;
  if (path[3] !== "responses") return RuleResult.ContinueProcessing;
  const lastPath = path[path.length - 1];
  const valueToIgnore = propertValuesToIgnore.get(lastPath);
  if (valueToIgnore === undefined) return RuleResult.ContinueProcessing;
  const value = (data as any).lhs ?? (data as any).rhs;
  if (value === valueToIgnore) return RuleResult.NoViolation;
  return RuleResult.ContinueProcessing;
}
