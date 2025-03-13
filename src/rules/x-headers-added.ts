import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";

/**
 * Added headers to RHS. There's an exception when
 * "retry-after" and "location" are added to a 200 or 201 response
 * because these are added by Azure operation templates.
 */
export function xHeadersAddedRule(
  data: Diff<any, any>
): RuleResult | undefined {
  if (!data.path || data.path.length < 2) return;
  const lastPaths = data.path.slice(-2);
  if (!lastPaths.includes("headers")) return;
  if (data.kind !== "N") return;
  // check if data is an object. If so, collect the top-level keys into an array
  const keys = Object.keys(data.rhs).toSorted();
  // Azure carve-out. Ignore 200 and 201 responses with "retry-after" and "location" headers added.
  if (
    keys.length === 2 &&
    keys.includes("retry-after") &&
    keys.includes("location") &&
    (data.path.includes("200") ||
      data.path.includes("201") ||
      data.path.includes("202"))
  ) {
    return RuleResult.NoViolation;
  }
}
