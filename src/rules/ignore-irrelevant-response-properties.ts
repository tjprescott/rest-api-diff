import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

const propertValuesToIgnore: Map<string, any> = new Map([
  ["x-nullable", false],
  ["readOnly", true],
  ["additionalProperties", false],
]);

/**
 * Ignores a response property when the value is the default and therefore irrelevant.
 */
export function ignoreIrrelevantResponsePropertiesRule(
  data: Diff<any, any>
): RuleResult | undefined {
  if (!data.path) return;
  const path = data.path;
  if (path.length < 4) return;
  if (path[3] !== "responses") return;
  const lastPath = path[path.length - 1];
  const valueToIgnore = propertValuesToIgnore.get(lastPath);
  if (valueToIgnore === undefined) return;
  const value = (data as any).lhs ?? (data as any).rhs;
  if (value === valueToIgnore) return RuleResult.NoViolation;
}
