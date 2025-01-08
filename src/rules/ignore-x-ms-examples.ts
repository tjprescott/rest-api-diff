import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Ignores any diff in x-ms-examples. These are documentation only and don't
 * affect the REST API surface area.
 * @param data
 * @returns
 */
export function ignoreXMsExamplesRule(
  data: Diff<any, any>
): RuleResult | undefined {
  if (!data.path) return;
  if (data.path.length < 4) return;
  const lastPath = data.path.slice(-1)[0];
  if (lastPath == "$example") {
    return RuleResult.NoViolation;
  }
  if (data.path[3] === "x-ms-examples") {
    return RuleResult.NoViolation;
  }
}
