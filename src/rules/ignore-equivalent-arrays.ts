import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";
import { OpenAPIV2 } from "openapi-types";
import { toSorted } from "../util.js";

function getParameter(
  source: OpenAPIV2.Document | undefined,
  path: string[]
): any | undefined {
  if (!source) return undefined;
  let current: any = source;
  for (const segment of path) {
    current = (current as any)[segment];
  }
  return current;
}

/**
 * Ignores array changes if the arrays are actually the same. This can occur due to
 * sorting differences, for example.
 */
export function ignoreEquivalentArrays(
  data: Diff<any, any>,
  lhs?: OpenAPIV2.Document,
  rhs?: OpenAPIV2.Document
): RuleResult | undefined {
  if (!data.path) return;
  if (data.path.length < 2) return;
  if (data.kind != "E") return;
  const lastPath = data.path.slice(-1)[0];
  // if lastPath is a number, it's an array index
  const isArray = !isNaN(Number(lastPath));
  if (!isArray) return;
  const arrayPath = data.path.slice(0, -1);
  const lhsArray = getParameter(lhs, arrayPath) as any[];
  const rhsArray = getParameter(rhs, arrayPath) as any[];
  // if arrays are both arrays of string and are equivalent when sorted, then there's no violation
  if (!lhsArray || !rhsArray) return;
  if (
    !lhsArray.every((x) => typeof x === "string") ||
    !rhsArray.every((x) => typeof x === "string")
  )
    return;
  if (toSorted(lhsArray).join() === toSorted(rhsArray).join()) {
    return RuleResult.NoViolation;
  }
}
