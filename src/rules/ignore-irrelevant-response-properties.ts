import { Diff } from "deep-diff";
import { DiffRuleResult } from "./rules.js";

const propertValuesToIgnore: Map<string, any> = new Map([
  ["x-nullable", false],
  ["readOnly", true],
]);

/**
 * Ignores a response property when the value is the default and therefore irrelevant.
 */
export function ignoreIrrelevantResponsePropertiesRule(
  data: Diff<any, any>
): DiffRuleResult {
  if (!data.path) return DiffRuleResult.ContinueProcessing;
  const path = data.path;
  if (path.length < 4) return DiffRuleResult.ContinueProcessing;
  if (path[3] !== "responses") return DiffRuleResult.ContinueProcessing;
  const lastPath = path[path.length - 1];
  const valueToIgnore = propertValuesToIgnore.get(lastPath);
  if (valueToIgnore === undefined) return DiffRuleResult.ContinueProcessing;
  const value = (data as any).lhs ?? (data as any).rhs;
  if (value === valueToIgnore) return DiffRuleResult.NoViolation;
  return DiffRuleResult.ContinueProcessing;
}
