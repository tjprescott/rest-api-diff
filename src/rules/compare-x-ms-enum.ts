import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Ignores differences in x-ms-enum values except modelAsString.
 */
export function compareXMsEnumRule(
  data: Diff<any, any>
): RuleResult | [RuleResult, string] | undefined {
  if (!data.path) return;
  const path = data.path.join(".");
  const regex = /x-ms-enum\.(\w+)./;
  const match = path.match(regex);
  if (!match) return;
  const property = match[1];
  if (property === "modelAsString") {
    const lhs = (data as any).lhs ?? "undefined";
    const rhs = (data as any).rhs ?? "undefined";
    const message = `x-ms-enum.modelAsString changed from '${lhs}' to '${rhs}'.`;
    return [RuleResult.FlaggedViolation, message];
  } else {
    return RuleResult.NoViolation;
  }
}
