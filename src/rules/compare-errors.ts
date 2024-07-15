import { Diff } from "deep-diff";
import { RuleResult as RuleResult } from "./rules.js";
import { OpenAPIV2 } from "openapi-types";

/**
 * Ensures that the LHS is compatible with the RHS.
 * The LSH must be a subset of the RHS.
 */
function reportIncompatibilities(
  lhs: any,
  rhs: any,
  prefix?: string
): string[] {
  const errors: string[] = [];
  if (!lhs || !rhs) {
    return errors;
  }
  // ensure the types are the same
  if (lhs.type !== rhs.type) {
    errors.push(
      `LHS type '${lhs.type}' is not the same as RHS type '${rhs.type}'`
    );
  }
  const lhsRequired = lhs.required ?? [];
  const rhsRequired = rhs.required ?? [];
  const lhsKeys = Object.keys(lhs.properties ?? {});
  const rhsKeys = Object.keys(rhs.properties ?? {});
  // ensure that lhs has all the rhs required keys
  for (const key of rhsRequired) {
    if (!lhsKeys.includes(key)) {
      const path = prefix ? `${prefix}.${key}` : key;
      errors.push(`LHS is missing key '${path}' required by RHS`);
    }
  }
  // ensure every property in lhs is in rhs
  for (const key of lhsKeys) {
    if (!rhsKeys.includes(key)) {
      const path = prefix ? `${prefix}.${key}` : key;
      errors.push(`LHS has key '${path}' which is not in RHS`);
    }
  }
  for (const key of lhsKeys) {
    errors.push(
      ...reportIncompatibilities(
        lhs.properties[key],
        rhs.properties[key],
        prefix ? `${prefix}.${key}` : `${key}`
      )
    );
  }
  return errors;
}

/**
 * Ignores a diff in the minLength property on the api-version parameter only.
 */
export function compareErrorsRule(
  data: Diff<any, any>,
  lhs?: OpenAPIV2.Document,
  rhs?: OpenAPIV2.Document
): RuleResult | [result: RuleResult, message: string] {
  if (!data.path) return RuleResult.ContinueProcessing;
  if (data.kind !== "E") return RuleResult.ContinueProcessing;
  const lastPath = data.path[data.path.length - 1];
  if (lastPath !== "$error") return RuleResult.ContinueProcessing;
  const lhsError = (lhs?.definitions as any)?.[data.lhs];
  const rhsError = (rhs?.definitions as any)?.[data.rhs];
  const errors = reportIncompatibilities(lhsError, rhsError);
  if (errors.length === 0) {
    return RuleResult.NoViolation;
  } else {
    return [RuleResult.FlaggedViolation, errors.join("\n")];
  }
}
