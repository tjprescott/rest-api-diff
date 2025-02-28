import { Diff } from "deep-diff";
import { RuleResult } from "./rules.js";
import { OpenAPIV2 } from "openapi-types";
import { getItemAtPath } from "../util.js";

/**
 * Constraints changed between the LHS and RHS. Allows for location, subscriptionId and
 * resourceGroupName parameters to add a minLength constraint without flagging.
 * Allows the RHS to delete a minimum of 0 without flagging.
 */
export function xConstraintChangedRule(
  data: Diff<any, any>,
  _?: OpenAPIV2.Document,
  rhs?: OpenAPIV2.Document
): RuleResult | [RuleResult, string] | undefined {
  if (!data.path) return;
  const lastPath = data.path.slice(-1)[0];
  const constraints = [
    "minLength",
    "maxLength",
    "pattern",
    "minimum",
    "maximum",
    "minItems",
    "maxItems",
  ];
  if (!constraints.includes(lastPath)) return;
  if (data.path.length < 3) return;
  const parameter = getItemAtPath(
    data.path.slice(0, -1),
    rhs!
  ) as OpenAPIV2.Parameter;

  if (data.path[data.path.length - 3] === "parameters") {
    // allow subscriptionId and location to add minLength constraints
    const allowedMinLengths = [
      "subscriptionid",
      "location",
      "resourcegroupname",
    ];
    if (lastPath === "minLength") {
      if (allowedMinLengths.includes(parameter.name.toLowerCase())) {
        return RuleResult.NoViolation;
      }
    }
  }

  // ignores if the rhs deleted a minimum of 0 since that's the default
  if (lastPath === "minimum" && data.kind === "D" && data.lhs === 0) {
    return RuleResult.NoViolation;
  }

  // ignores if rhs added maxLength 90 to resourceGroupName
  if (
    lastPath === "maxLength" &&
    parameter.name.toLowerCase() === "resourcegroupname" &&
    data.kind == "N" &&
    data.rhs === 90
  ) {
    return RuleResult.NoViolation;
  }

  const message = `Constraint '${lastPath}' changed for parameter '${parameter.name}'`;
  return [RuleResult.FlaggedViolation, message];
}
